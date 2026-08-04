(function () {
'use strict';

var cfg  = window.PREVIEW_CONFIG || {};
var page = cfg.page || 'home';

var statusEl         = document.getElementById('customizerStatus');
var sectionRegistry  = [];  // sections on this page (from state)
var allThemeSections = [];  // every section in the theme (for add modal)
var selectedSection  = null;
var selectedValues   = {};
var themeGroups      = [];
var themeValues      = {};
var isReadOnly       = false;

// The preview iframe — we keep a reference and NEVER reload the whole page
var previewFrame = document.getElementById('previewFrame') || document.querySelector('.preview iframe');

var drawer        = document.getElementById('sectionDrawer');
var drawerOverlay = document.getElementById('drawerOverlay');
var drawerTitle   = document.getElementById('drawerTitle');
var drawerFields  = document.getElementById('drawerFields');

// ── iframe reload strategy ────────────────────────────────────────────────────
// • After saving section values  → postMessage only (iframe listens to WS anyway)
// • After structural changes (add/remove/reorder) → reload iframe src once
// The customizer sidebar NEVER reloads — it holds all state in JS memory.

var _softTimer = null;
function softReload() {
    // The server already broadcasts WS "reload" after writes that touch files.
    // postMessage is a no-op fallback in case the iframe hasn't connected WS yet.
    clearTimeout(_softTimer);
    _softTimer = setTimeout(function () {
        if (previewFrame && previewFrame.contentWindow) {
            previewFrame.contentWindow.postMessage({ type: 'SECTION_UPDATED', page: page }, '*');
        }
    }, 200);
}

function hardReload() {
    if (previewFrame && previewFrame.contentWindow) {
        previewFrame.contentWindow.location.reload();
    }
}

// ── Status bar ────────────────────────────────────────────────────────────────
function status(msg, isError) {
    statusEl.style.color = isError ? '#ef4444' : '#1ab394';
    statusEl.textContent = msg;
    if (!isError) setTimeout(function () { statusEl.textContent = ''; }, 3000);
}

// ── API helper ────────────────────────────────────────────────────────────────
async function api(url, options) {
    var res = await fetch(url, Object.assign(
        { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } },
        options || {}
    ));
    var json = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(json.error || res.statusText);
    return json.data !== undefined ? json.data : json;
}

// ── Field helpers ─────────────────────────────────────────────────────────────
function fieldLabel(f) { return f.label || f.label_en || f.id || 'Field'; }

function getDefault(f) {
    if (Object.prototype.hasOwnProperty.call(f, 'default')) return f.default;
    if (f.type === 'checkbox') return false;
    if (f.type === 'repeater') return [];
    if (['product','category','category_picker','blog_picker'].indexOf(f.type) >= 0) return f.multiple ? [] : '';
    if (f.type === 'spacing') return { top:0, right:0, bottom:0, left:0 };
    return '';
}

function valueFor(f, vals) {
    return Object.prototype.hasOwnProperty.call(vals, f.id) ? vals[f.id] : getDefault(f);
}

function ea(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function eh(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function inputLimitAttrs(f) {
    var a = '';
    if (f.min        !== undefined) a += ' minlength="'+Number(f.min)+'"';
    if (f.max        !== undefined) a += ' maxlength="'+Number(f.max)+'"';
    if (f.min_length !== undefined) a += ' minlength="'+Number(f.min_length)+'"';
    if (f.max_length !== undefined) a += ' maxlength="'+Number(f.max_length)+'"';
    return a;
}

function normalizeValue(f, input) {
    if (f.type === 'image') {
        var wrap = document.querySelector('[data-field-wrap="'+f.id+'"]');
        if (wrap) {
            var hidden = wrap.querySelector('input[type="hidden"][data-field-id="'+f.id+'"]');
            return hidden ? hidden.value : '';
        }
        return input ? input.value : '';
    }
    if (f.type === 'checkbox') return Boolean(input.checked);
    if (['number','range'].indexOf(f.type) >= 0) return input.value === '' ? '' : Number(input.value);
    if (['product','category','category_picker','blog_picker'].indexOf(f.type) >= 0) {
        var h = input;
        if (h) {
            var ids = h.value ? h.value.split(',').map(function(v){return parseInt(v.trim(),10);}).filter(Boolean) : [];
            return f.multiple === false ? (ids[0]||null) : ids;
        }
        return f.multiple === false ? null : [];
    }
    if (f.type === 'spacing') {
        return {
            top:    Number(document.querySelector('[data-field-id="'+f.id+'"][data-side="top"]').value||0),
            right:  Number(document.querySelector('[data-field-id="'+f.id+'"][data-side="right"]').value||0),
            bottom: Number(document.querySelector('[data-field-id="'+f.id+'"][data-side="bottom"]').value||0),
            left:   Number(document.querySelector('[data-field-id="'+f.id+'"][data-side="left"]').value||0),
        };
    }
    if (f.type === 'link') {
        var lt  = document.querySelector('[data-field-id="'+f.id+'"][data-link-part="type"]').value;
        var lu  = document.querySelector('[data-field-id="'+f.id+'"][data-link-part="url"]').value;
        var lid = parseInt(document.querySelector('[data-field-id="'+f.id+'"][data-link-part="id"]').value||0,10);
        return lt === 'custom' ? { type:'custom', url:lu } : { type:lt, id:lid||null };
    }
    if (f.type === 'repeater') {
        var rows = [];
        document.querySelectorAll('[data-repeater-id="'+f.id+'"] .repeater-row').forEach(function(row){
            var item = {};
            (f.fields||[]).forEach(function(nf){
                var ni = row.querySelector('[data-nested-field-id="'+nf.id+'"]');
                if (ni) item[nf.id] = normalizeValue(nf, ni);
            });
            rows.push(item);
        });
        return rows;
    }
    return input.value;
}

// ── Pickers ───────────────────────────────────────────────────────────────────
var PEM = { product:'products', category:'categories', category_picker:'categories', blog_picker:'blogs' };
function pe(t) { return PEM[t] || 'products'; }

function mountPicker(wrap, f, items0) {
    var multi  = f.multiple !== false;
    var ep     = pe(f.type);
    var hidden = wrap.querySelector('[data-picker-hidden]');
    var tagsEl = wrap.querySelector('.picker-tags');
    var srchEl = wrap.querySelector('.picker-search');
    var dropEl = wrap.querySelector('.picker-dropdown');
    var items  = items0.slice();

    function getIds() { return items.map(function(i){return i.id;}); }

    function renderTags() {
        tagsEl.querySelectorAll('.picker-tag').forEach(function(el){el.remove();});
        items.forEach(function(item){
            var tag = document.createElement('span'); tag.className = 'picker-tag';
            tag.innerHTML = eh(item.name)+(!isReadOnly?' <button type="button" class="rm" data-rm-id="'+item.id+'">×</button>':'');
            tagsEl.insertBefore(tag, srchEl);
        });
        hidden.value = getIds().join(',');
        scheduleSave();
    }

    function closeDrop() { dropEl.innerHTML=''; dropEl.style.display='none'; }

    function openDrop(results) {
        dropEl.innerHTML='';
        if (!results.length) { dropEl.innerHTML='<div class="picker-empty">لا توجد نتائج</div>'; }
        else results.forEach(function(item){
            var opt = document.createElement('div'); opt.className='picker-option';
            var img = item.image?'<img src="'+ea(item.image)+'" alt="">':'<span style="width:32px;height:32px;background:#e5e7eb;border-radius:6px;display:inline-block;flex-shrink:0"></span>';
            var sub = item.sku?eh(item.sku):(item.slug?eh(item.slug):'');
            opt.innerHTML = img+'<span class="opt-name">'+eh(item.name)+'</span>'+(sub?'<span class="opt-sub">'+sub+'</span>':'');
            opt.addEventListener('mousedown',function(e){
                e.preventDefault();
                if(!multi) items=[];
                if(!items.find(function(x){return x.id===item.id;})) items.push({id:item.id,name:item.name});
                renderTags(); srchEl.value=''; closeDrop();
            });
            dropEl.appendChild(opt);
        });
        dropEl.style.display='block';
    }

    var _st = null;
    function doSearch(q) {
        var qs = '?query='+encodeURIComponent(q);
        getIds().forEach(function(id){qs+='&exclude_ids[]='+id;});
        api('/__preview/api/picker/'+ep+qs).then(function(r){openDrop(Array.isArray(r)?r:[]);}).catch(function(){closeDrop();});
    }

    if (!isReadOnly) {
        srchEl.addEventListener('focus',function(){doSearch('');});
        srchEl.addEventListener('input',function(){clearTimeout(_st);_st=setTimeout(function(){doSearch(srchEl.value.trim());},250);});
        srchEl.addEventListener('blur',function(){setTimeout(closeDrop,150);});
        tagsEl.addEventListener('click',function(e){
            var btn=e.target.closest('.rm');
            if(btn){items=items.filter(function(i){return i.id!==parseInt(btn.dataset.rmId,10);});renderTags();closeDrop();}
            else if(!e.target.closest('.picker-tag')) srchEl.focus();
        });
    }
    renderTags();
}

function initPickerFields(fields, vals, root) {
    var tasks = [];
    (fields || []).forEach(function(f){
        if (PEM[f.type] && f.id) {
            // Scope picker wrappers to the current root (top-level drawer or a repeater row).
            // Exclude wrappers that belong to a repeater row other than the current root.
            var rootRow = root.closest('.repeater-row');
            var wrappers = Array.from(root.querySelectorAll('[data-field-wrap="'+f.id+'"]')).filter(function(wrap){
                var wrapRow = wrap.closest('.repeater-row');
                return !wrapRow || wrapRow === rootRow;
            });
            if (!wrappers.length) return;
            var raw = valueFor(f, vals), ids = Array.isArray(raw) ? raw : (raw ? [raw] : []);
            var resolvePromise;
            if (!ids.length) {
                resolvePromise = Promise.resolve([]);
            } else {
                var qs = ids.map(function(id){return 'ids[]='+id;}).join('&');
                resolvePromise = api('/__preview/api/picker/'+pe(f.type)+'/resolve?'+qs)
                    .then(function(r){return Array.isArray(r)?r:[];})
                    .catch(function(){return ids.map(function(id){return {id:id,name:'#'+id};});});
            }
            tasks.push(resolvePromise.then(function(items){
                wrappers.forEach(function(wrap){ mountPicker(wrap, f, items); });
            }));
        } else if (f.type === 'repeater') {
            var rows = root.querySelectorAll('[data-repeater-id="'+f.id+'"] .repeater-row');
            var rowVals = valueFor(f, vals) || [];
            rows.forEach(function(row, idx){
                tasks.push(initPickerFields(f.fields || [], rowVals[idx] || {}, row));
            });
        }
    });
    return Promise.all(tasks);
}

function bindLinkPickers(root) {
    var LE={category:'categories',product:'products',blog:'blogs'};
    root.querySelectorAll('[data-link-field]').forEach(function(sel){
        var wrap=sel.closest('[data-field-wrap]'); if(!wrap) return;
        var uInp=wrap.querySelector('[data-link-url-wrap] input');
        var ew=wrap.querySelector('[data-link-entity-wrap]');
        var hid=wrap.querySelector('[data-link-part="id"]');
        var tEl=ew&&ew.querySelector('.picker-tags');
        var sEl=ew&&ew.querySelector('.picker-search');
        var dEl=ew&&ew.querySelector('.picker-dropdown');
        if(!ew||!tEl||!sEl||!dEl||!hid) return;
        function sv(t){if(uInp)uInp.style.display=t==='custom'?'':'none';ew.style.display=t!=='custom'?'':'none';}
        function rt(name){tEl.querySelectorAll('.picker-tag').forEach(function(t){t.remove();});if(!name)return;var tag=document.createElement('span');tag.className='picker-tag';tag.innerHTML=eh(name)+(!isReadOnly?' <button type="button" class="rm" data-rm-id="0">×</button>':'');tEl.insertBefore(tag,sEl);}
        function cd(){dEl.innerHTML='';dEl.style.display='none';}
        function od(results,onSel){dEl.innerHTML='';if(!results.length){dEl.innerHTML='<div class="picker-empty">لا توجد نتائج</div>';}else results.forEach(function(item){var opt=document.createElement('div');opt.className='picker-option';var img=item.image?'<img src="'+ea(item.image)+'" alt="">':'<span style="width:32px;height:32px;background:#e5e7eb;border-radius:6px;display:inline-block;flex-shrink:0"></span>';opt.innerHTML=img+'<span class="opt-name">'+eh(item.name)+'</span>';opt.addEventListener('mousedown',function(e){e.preventDefault();onSel(item);});dEl.appendChild(opt);});dEl.style.display='block';}
        var _lt=null;
        function dls(type,q){var ep=LE[type];if(!ep)return;api('/__preview/api/picker/'+ep+'?query='+encodeURIComponent(q)).then(function(r){od(Array.isArray(r)?r:[],function(item){hid.value=item.id;rt(item.name);sEl.value='';cd();scheduleSave();});}).catch(function(){cd();});}
        if(!isReadOnly){sEl.addEventListener('focus',function(){dls(sel.value,'');});sEl.addEventListener('input',function(){clearTimeout(_lt);_lt=setTimeout(function(){dls(sel.value,sEl.value.trim());},250);});sEl.addEventListener('blur',function(){setTimeout(cd,150);});tEl.addEventListener('click',function(e){if(e.target.closest('.rm')){hid.value='';rt('');scheduleSave();}else if(!e.target.closest('.picker-tag'))sEl.focus();});}
        sel.addEventListener('change',function(){sv(sel.value);hid.value='';rt('');scheduleSave();});
        sv(sel.value);
        var eid=parseInt(hid.value||0,10);
        if(eid&&LE[sel.value]){api('/__preview/api/picker/'+LE[sel.value]+'/resolve?ids[]='+eid).then(function(r){if(Array.isArray(r)&&r[0])rt(r[0].name);}).catch(function(){});}
    });
}

// ── Field renderers ───────────────────────────────────────────────────────────
function renderCheckboxAsToggle(f, val, dis) {
    var lbl=fieldLabel(f), desc=f.description||f.help||'';
    return '<div class="toggle-row" data-field-wrap="'+f.id+'">'+
        '<div class="toggle-info"><div class="t-title">'+eh(lbl)+'</div>'+(desc?'<div class="t-desc">'+eh(desc)+'</div>':'')+' </div>'+
        '<label class="tog"><input type="checkbox" data-field-id="'+f.id+'"'+(val?' checked':'')+(dis?' disabled':'')+'>'+
        '<div class="tog-track"></div><div class="tog-thumb" style="right:'+(val?'auto':'3px')+';left:'+(val?'3px':'auto')+'"></div></label></div>';
}

function renderRepeater(f, rows) {
    rows=Array.isArray(rows)?rows:[];
    var mi=parseInt(f.max_items||20,10), nested=Array.isArray(f.fields)?f.fields:[];
    var body=rows.map(function(row,idx){
        return '<div class="repeater-row" data-repeater-index="'+idx+'">'+
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'+
            '<strong style="font-size:13px">'+(f.item_label||'عنصر')+' '+(idx+1)+'</strong>'+
            (isReadOnly?''  :'<button type="button" class="item-del" data-repeater-remove="'+f.id+'" data-index="'+idx+'">✕</button>')+
            '</div>'+nested.map(function(nf){return renderNestedField(nf,row);}).join('')+'</div>';
    }).join('');
    return '<div class="field" data-field-wrap="'+f.id+'"><label>'+fieldLabel(f)+'</label>'+
        '<div class="repeater" data-repeater-id="'+f.id+'" data-max-items="'+mi+'">'+body+'</div>'+
        (isReadOnly?''  :'<button type="button" class="add-btn" data-repeater-add="'+f.id+'">+ إضافة '+(f.item_label||'عنصر')+'</button>')+
        '</div>';
}

function renderNestedField(f, vals) {
    return renderField(f,vals).replaceAll('data-field-id="'+f.id+'"','data-field-id="'+f.id+'" data-nested-field-id="'+f.id+'"');
}

function renderField(f, vals) {
    if(!f.id) return '';
    var val=valueFor(f,vals), dis=isReadOnly?' disabled':'';
    if(f.type==='checkbox') return renderCheckboxAsToggle(f,val,isReadOnly);
    var lbl=fieldLabel(f);
    if(f.type==='select'){
        var opts=(f.options||[]).map(function(o){var s=String(o.value)===String(val)?' selected':'';return'<option value="'+String(o.value).replace(/"/g,'&quot;')+'"'+s+'>'+(o.label||o.value)+'</option>';}).join('');
        return '<div class="field" data-field-wrap="'+f.id+'"><label>'+lbl+'</label><select data-field-id="'+f.id+'"'+dis+'>'+opts+'</select></div>';
    }
    if(f.type==='textarea') return '<div class="field" data-field-wrap="'+f.id+'"><label>'+lbl+'</label><textarea data-field-id="'+f.id+'"'+inputLimitAttrs(f)+dis+'>'+eh(val||'')+'</textarea></div>';
    if(f.type==='range') return '<div class="field" data-field-wrap="'+f.id+'"><label>'+lbl+(f.unit?' <code>'+f.unit+'</code>':'')+'</label><input type="range" min="'+(f.min??0)+'" max="'+(f.max??100)+'" step="'+(f.step??1)+'" value="'+(val??'')+'" data-field-id="'+f.id+'"'+dis+'></div>';
    if(f.type==='color'){
        var cv=val||'#000000';
        return '<div class="field color-field-row" data-field-wrap="'+f.id+'">'+
            '<label class="color-field-label">'+
            '<span class="color-field-text"><span class="color-field-name">'+eh(lbl)+'</span><span class="color-hex-val">'+eh(cv)+'</span></span>'+
            '<label class="color-circle-wrap" title="'+ea(lbl)+'">'+
            '<span class="color-circle" style="background:'+ea(cv)+'"></span>'+
            '<input type="color" value="'+ea(cv)+'" data-field-id="'+f.id+'"'+dis+
            ' oninput="this.previousElementSibling.style.background=this.value;this.closest(\'.color-field-row\').querySelector(\'.color-hex-val\').textContent=this.value">'+
            '</label>'+
            '</label></div>';
    }
    if(f.type==='spacing'){
        var s=val||{};
        return '<div class="field" data-field-wrap="'+f.id+'"><label>'+lbl+'</label><div class="field-inline">'+
            ['top','right','bottom','left'].map(function(side){return'<input type="number" data-field-id="'+f.id+'" data-side="'+side+'" placeholder="'+side+'" value="'+(s[side]??0)+'"'+dis+'>';}).join('')+
            '</div></div>';
    }
    if(['product','category','category_picker','blog_picker'].indexOf(f.type)>=0){
        var am=f.multiple!==false;
        return '<div class="field" data-field-wrap="'+f.id+'"><label>'+lbl+'</label>'+
            '<input type="hidden" data-picker-hidden="'+f.id+'" data-field-id="'+f.id+'">'+
            '<div class="picker-wrap"><div class="picker-tags">'+(isReadOnly?''  :'<input class="picker-search" type="text" placeholder="ابحث…"'+(am?'':' data-picker-single')+'>')+'</div>'+
            '<div class="picker-dropdown" style="display:none"></div></div></div>';
    }
    if(f.type==='link'){
        var lnk=val&&typeof val==='object'?val:{}, lt=lnk.type||'custom';
        return '<div class="field" data-field-wrap="'+f.id+'"><label>'+lbl+'</label>'+
            '<select data-field-id="'+f.id+'" data-link-part="type" data-link-field'+dis+'>'+
            ['custom','category','product','blog'].map(function(t){return'<option value="'+t+'"'+(t===lt?' selected':'')+'>'+t+'</option>';}).join('')+'</select>'+
            '<div style="margin-top:8px" data-link-url-wrap><input type="url" data-field-id="'+f.id+'" data-link-part="url" placeholder="رابط مخصص" value="'+(lnk.url||'')+'"'+dis+(lt!=='custom'?' style="display:none"':'')+' ></div>'+
            '<div style="margin-top:8px" data-link-entity-wrap'+(lt==='custom'?' style="display:none"':'')+'>'+
            '<div class="picker-wrap"><div class="picker-tags" data-link-picker-tags>'+(isReadOnly?''  :'<input class="picker-search" type="text" placeholder="ابحث…" data-picker-single>')+'</div>'+
            '<div class="picker-dropdown" style="display:none"></div></div>'+
            '<input type="hidden" data-field-id="'+f.id+'" data-link-part="id" value="'+(lnk.id||'')+'" ></div></div>';
    }
    if(f.type==='image'){
        var imgVal=val||'';
        var previewHtml=imgVal?'<img src="'+ea(imgVal)+'" alt="" style="width:100%;height:120px;object-fit:cover;border-radius:6px;border:1px solid #e8ecf0">':'<div style="width:100%;height:120px;display:flex;align-items:center;justify-content:center;background:#f4f6f8;border:1px dashed #e8ecf0;border-radius:6px;color:#9ca3af;font-size:12px">لا توجد صورة</div>';
        return '<div class="field" data-field-wrap="'+f.id+'">'+
            '<label>'+lbl+'</label>'+
            '<input type="hidden" data-field-id="'+f.id+'" value="'+ea(imgVal)+'">'+
            '<div class="image-preview" style="margin-bottom:8px">'+previewHtml+'</div>'+
            (isReadOnly?'':'<div style="display:flex;gap:8px">'+
            '<label style="flex:1;padding:8px;background:#f4f6f8;border:1px solid #e8ecf0;border-radius:6px;cursor:pointer;text-align:center;font-size:12px;font-weight:600;color:#6b7280;transition:all .15s" onmouseover="this.style.borderColor=\'var(--accent)\';this.style.color=\'var(--accent)\'" onmouseout="this.style.borderColor=\'#e8ecf0\';this.style.color=\'#6b7280\'">📤 رفع صورة<input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp" data-image-upload="'+f.id+'" style="display:none"></label>'+
            (imgVal?'<button type="button" data-image-clear="'+f.id+'" style="padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;cursor:pointer;font-size:12px;color:#ef4444">✕</button>':'')+
            '</div>')+
            '</div>';
    }
    if(f.type==='repeater') return renderRepeater(f,val);
    var type=['date','datetime-local','number','url'].indexOf(f.type)>=0?f.type:'text';
    return '<div class="field" data-field-wrap="'+f.id+'"><label>'+lbl+'</label><input type="'+type+'" data-field-id="'+f.id+'" value="'+ea(val||'')+'"'+(type==='text'?inputLimitAttrs(f):'')+dis+'></div>';
}

// ── Collect values ────────────────────────────────────────────────────────────
function collectValues(fields, root) {
    var vals={};
    fields.forEach(function(f){
        if(!f.id) return;
        if(f.type==='repeater'){vals[f.id]=normalizeValue(f,null);return;}
        var inp=root.querySelector('[data-field-id="'+f.id+'"]');
        if(inp) vals[f.id]=normalizeValue(f,inp);
    });
    return vals;
}

// ── Repeater actions ──────────────────────────────────────────────────────────
function bindRepeaterActions(){
    document.querySelectorAll('[data-repeater-add]').forEach(function(btn){
        btn.onclick=function(){
            var id=btn.dataset.repeaterAdd;
            var f=(selectedSection.settings||[]).find(function(x){return x.id===id;});
            if(!f) return;
            selectedValues[id]=collectValues(selectedSection.settings||[],drawerFields)[id]||[];
            if(selectedValues[id].length>=parseInt(f.max_items||20,10)) return status('وصلت للحد الأقصى',true);
            var row={};(f.fields||[]).forEach(function(nf){row[nf.id]=getDefault(nf);});
            selectedValues[id].push(row);
            drawerFields.innerHTML=(selectedSection.settings||[]).map(function(x){return renderField(x,selectedValues);}).join('');
            bindRepeaterActions();bindFieldListeners();bindImageUploads();
            initPickerFields(selectedSection.settings||[], selectedValues, drawerFields);
        };
    });
    document.querySelectorAll('[data-repeater-remove]').forEach(function(btn){
        btn.onclick=function(){
            var id=btn.dataset.repeaterRemove;
            selectedValues[id]=collectValues(selectedSection.settings||[],drawerFields)[id]||[];
            selectedValues[id].splice(parseInt(btn.dataset.index,10),1);
            drawerFields.innerHTML=(selectedSection.settings||[]).map(function(x){return renderField(x,selectedValues);}).join('');
            bindRepeaterActions();bindFieldListeners();bindImageUploads();
            initPickerFields(selectedSection.settings||[], selectedValues, drawerFields);
        };
    });
}

// ── Auto-save (section values) ────────────────────────────────────────────────
var _saveTimer=null;
function scheduleSave(){
    if(isReadOnly) return;
    clearTimeout(_saveTimer);
    _saveTimer=setTimeout(function(){saveSelectedSection().catch(function(e){status(e.message,true);});},700);
}

function bindFieldListeners(){
    drawerFields.querySelectorAll('input,select,textarea').forEach(function(el){
        el.removeEventListener('input',scheduleSave);
        el.removeEventListener('change',scheduleSave);
        el.addEventListener('input',scheduleSave);
        el.addEventListener('change',scheduleSave);
    });
}

// ── Image upload binding ──────────────────────────────────────────────────────
function bindImageUploads(root){
    root=root||drawerFields;
    root.querySelectorAll('[data-image-upload]').forEach(function(fileInput){
        fileInput.onchange=function(){
            if(!fileInput.files||!fileInput.files[0]) return;
            var fieldId=fileInput.dataset.imageUpload;
            var wrap=root.querySelector('[data-field-wrap="'+fieldId+'"]');
            if(!wrap) return;
            var preview=wrap.querySelector('.image-preview');
            var hidden=wrap.querySelector('input[type="hidden"][data-field-id="'+fieldId+'"]');
            var origHtml=preview.innerHTML;
            preview.innerHTML='<div style="width:100%;height:120px;display:flex;align-items:center;justify-content:center;gap:8px;background:#f4f6f8;border:1px solid #e8ecf0;border-radius:6px">'+
                '<div style="flex:1;height:6px;background:#e8ecf0;border-radius:4px;overflow:hidden;margin:0 12px">'+
                '<div class="img-upload-bar" style="width:0%;height:100%;background:linear-gradient(90deg,var(--accent),#8b5cf6);border-radius:4px;transition:width .2s"></div></div>'+
                '<span class="img-upload-pct" style="font-size:11px;color:#6b7280;font-weight:600;white-space:nowrap">0%</span></div>';
            var bar=preview.querySelector('.img-upload-bar');
            var pct=preview.querySelector('.img-upload-pct');

            var formData=new FormData();
            formData.append('file',fileInput.files[0]);
            var xhr=new XMLHttpRequest();
            xhr.upload.addEventListener('progress',function(e){
                if(e.lengthComputable){var p=Math.round(e.loaded/e.total*100);bar.style.width=p+'%';pct.textContent=p+'%';}
            });
            xhr.addEventListener('load',function(){
                fileInput.value='';
                if(xhr.status>=200&&xhr.status<300){
                    try{
                        var data=JSON.parse(xhr.responseText);
                        var url=data.url||'';
                        if(hidden) hidden.value=url;
                        preview.innerHTML='<img src="'+ea(url)+'" alt="" style="width:100%;height:120px;object-fit:cover;border-radius:6px;border:1px solid #e8ecf0">';
                        // Add clear button if not present
                        var btnWrap=wrap.querySelector('div[style*="display:flex;gap:8px"]');
                        if(btnWrap&&!btnWrap.querySelector('[data-image-clear]')){
                            var clr=document.createElement('button');
                            clr.type='button';clr.dataset.imageClear=fieldId;
                            clr.style.cssText='padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;cursor:pointer;font-size:12px;color:#ef4444';
                            clr.textContent='✕';
                            clr.onclick=function(){clearImageField(fieldId,root);};
                            btnWrap.appendChild(clr);
                        }
                        status('تم رفع الصورة ✓');
                        if(root===drawerFields) scheduleSave(); else scheduleThemeSave();
                    }catch(e){
                        preview.innerHTML=origHtml;
                        status('استجابة غير صالحة',true);
                    }
                }else{
                    preview.innerHTML=origHtml;
                    var msg='فشل الرفع';
                    try{msg=JSON.parse(xhr.responseText).error||msg;}catch(e){}
                    status(msg,true);
                }
            });
            xhr.addEventListener('error',function(){
                fileInput.value='';
                preview.innerHTML=origHtml;
                status('خطأ في الشبكة',true);
            });
            xhr.open('POST','/__preview/api/media/upload');
            xhr.send(formData);
        };
    });
    root.querySelectorAll('[data-image-clear]').forEach(function(btn){
        btn.onclick=function(){clearImageField(btn.dataset.imageClear,root);};
    });
}

function clearImageField(fieldId,root){
    root=root||drawerFields;
    var wrap=root.querySelector('[data-field-wrap="'+fieldId+'"]');
    if(!wrap) return;
    var hidden=wrap.querySelector('input[type="hidden"][data-field-id="'+fieldId+'"]');
    if(hidden) hidden.value='';
    var preview=wrap.querySelector('.image-preview');
    if(preview) preview.innerHTML='<div style="width:100%;height:120px;display:flex;align-items:center;justify-content:center;background:#f4f6f8;border:1px dashed #e8ecf0;border-radius:6px;color:#9ca3af;font-size:12px">لا توجد صورة</div>';
    var btn=wrap.querySelector('[data-image-clear]');
    if(btn) btn.remove();
    if(root===drawerFields) scheduleSave(); else scheduleThemeSave();
}

// ── Drawer ────────────────────────────────────────────────────────────────────
function openDrawer(section){
    selectedSection=section;
    drawerTitle.textContent=resolveName(section.name, section.slug)||section.uuid;
    var settings=selectedSection.settings||[];
    // Use in-memory cached values — NOT re-fetched from server on re-open
    selectedValues=selectedSection._cachedValues||{};
    drawerFields.innerHTML=settings.map(function(f){return renderField(f,selectedValues);}).join('');
    bindRepeaterActions();bindFieldListeners();bindImageUploads();
    initPickerFields(settings,selectedValues,drawerFields);
    bindLinkPickers(drawerFields);
    drawer.classList.add('open');
    drawerOverlay.classList.add('open');
}

function closeDrawer(){
    drawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
    document.querySelectorAll('.section-card').forEach(function(c){c.classList.remove('active');});
}

document.getElementById('drawerBack').addEventListener('click',closeDrawer);
drawerOverlay.addEventListener('click',closeDrawer);

// ── Load section schema + values (cached in sec object) ───────────────────────
async function loadSectionData(sec){
    // Schema: fetch once, then cached on sec.settings
    if(!sec.settings||sec.settings.length===0){
        try{
            var schema=await api('/__preview/api/section-schema/'+encodeURIComponent(sec.slug));
            sec.settings=schema.settings||[];
        }catch(e){ sec.settings=[]; }
    }
    // Values: fetch once, then cached on sec._cachedValues
    // On re-open: use cache (no server round-trip, no data loss)
    if(!sec._cachedValues){
        try{
            sec._cachedValues=await api('/__preview/api/section-values/'+page+'/'+encodeURIComponent(sec.uuid));
        }catch(e){ sec._cachedValues={}; }
    }
    selectedValues=sec._cachedValues;
}

// ── Save section values ────────────────────────────────────────────────────────
// Saves to server + updates in-memory cache.
// Uses softReload (postMessage) — NOT iframe src reload.
// The WS broadcast from server.js triggers iframe refresh automatically.
async function saveSelectedSection(){
    if(!selectedSection) return;
    var values=collectValues(selectedSection.settings||[],drawerFields);
    await api('/__preview/api/section-values/'+page+'/'+encodeURIComponent(selectedSection.uuid),{
        method:'POST', body:JSON.stringify({settings:values})
    });
    // تحديث الـ cache في الـ memory فوراً — عشان لو فتحت الـ drawer تاني تلاقي نفس القيم
    selectedSection._cachedValues=Object.assign({},values);
    status('تم الحفظ ✓');
}

document.getElementById('saveDrawerBtn').addEventListener('click',function(){
    saveSelectedSection().then(closeDrawer).catch(function(e){status(e.message,true);});
});

async function resetSectionToDefaults(){
    if(!selectedSection) return;
    var defaults={};
    (selectedSection.settings||[]).forEach(function(f){ if(f.id) defaults[f.id]=getDefault(f); });
    selectedSection._cachedValues=Object.assign({},defaults);
    await api('/__preview/api/section-values/'+page+'/'+encodeURIComponent(selectedSection.uuid),{
        method:'POST', body:JSON.stringify({settings:defaults})
    });
    status('تمت إعادة التعيين ✓');
    openDrawer(selectedSection);
}
document.getElementById('resetDrawerBtn').addEventListener('click',function(){
    if(!confirm('إعادة تعيين جميع حقول القسم للقيم الافتراضية؟')) return;
    resetSectionToDefaults().catch(function(e){status(e.message,true);});
});

// ── Section cards ─────────────────────────────────────────────────────────────
var ICONS={banner:'🖼',slider:'🎠',hero:'⭐',product:'🛍',category:'📂',blog:'📝',text:'✏️',image:'🖼',video:'▶️',cart:'🛒',footer:'⬇️',header:'⬆️',testimonial:'💬',faq:'❓',offer:'🏷',countdown:'⏱',newsletter:'📧',brands:'🏷',promotions:'🎁',gallery:'🖼',featured:'⭐',value:'💎',interactive:'🖱'};
function sectionIcon(slug){
    var s=(slug||'').toLowerCase();
    for(var k in ICONS){if(s.indexOf(k)>=0)return ICONS[k];}
    return '⊞';
}

// Resolve name: handle {en,ar} objects, plain strings, or fallback to slug
function resolveName(name, slug){
    if(!name) return slug||'';
    if(typeof name === 'string') return name;
    if(typeof name === 'object'){
        return name.ar||name.en||name.Arabic||name.English||Object.values(name)[0]||slug||'';
    }
    return slug||'';
}

function buildSectionCards(registry){
    var list=document.getElementById('sectionList');
    if(!registry.length){
        list.innerHTML='<div class="empty-state"><div class="empty-state-icon">⊞</div>لا توجد أقسام في هذه الصفحة</div>';
        return;
    }
    list.innerHTML=registry.map(function(sec,idx){
        var displayName=resolveName(sec.name, sec.slug);
        return '<div class="section-card" data-uuid="'+ea(sec.uuid)+'" draggable="true">'+
            '<div class="section-card-drag" title="اسحب لإعادة الترتيب">⠿</div>'+
            '<div class="section-card-icon">'+sectionIcon(sec.slug)+'</div>'+
            '<div class="section-card-info">'+
              '<div class="section-card-name">'+eh(displayName)+'</div>'+
              '<div class="section-card-sub">'+eh(sec.slug)+'</div>'+
            '</div>'+
            '<button class="section-card-del" data-uuid="'+ea(sec.uuid)+'" title="حذف" aria-label="حذف">🗑</button>'+
            '<span class="section-card-arrow">←</span>'+
        '</div>';
    }).join('');

    list.querySelectorAll('.section-card').forEach(function(card){
        card.addEventListener('click',function(e){
            if(e.target.closest('.section-card-del')) return;
            list.querySelectorAll('.section-card').forEach(function(c){c.classList.remove('active');});
            card.classList.add('active');
            var sec=sectionRegistry.find(function(s){return s.uuid===card.dataset.uuid;});
            if(!sec) return;
            loadSectionData(sec).then(function(){openDrawer(sec);}).catch(function(e){status(e.message,true);});
        });
        card.querySelector('.section-card-del').addEventListener('click',function(e){
            e.stopPropagation();
            if(!confirm('هل تريد حذف هذا القسم من الصفحة؟')) return;
            removeSection(card.dataset.uuid).catch(function(e){status(e.message,true);});
        });
    });

    bindDragSort(list);
}

// ── Drag-to-reorder ───────────────────────────────────────────────────────────
var _dragSrc=null;
function bindDragSort(list){
    list.querySelectorAll('.section-card').forEach(function(card){
        card.addEventListener('dragstart',function(e){
            _dragSrc=card; e.dataTransfer.effectAllowed='move';
            // Create clean drag image detached from sidebar to prevent duplication visual
            var rect=card.getBoundingClientRect();
            var clone=card.cloneNode(true);
            clone.style.width=rect.width+'px';
            clone.style.height=rect.height+'px';
            clone.style.position='fixed';
            clone.style.left='-9999px';
            clone.style.top='0';
            clone.style.opacity='0.9';
            clone.style.transform='none';
            clone.style.boxShadow='0 4px 20px rgba(0,0,0,.2)';
            document.body.appendChild(clone);
            e.dataTransfer.setDragImage(clone, Math.round(rect.width/2), Math.round(rect.height/2));
            setTimeout(function(){document.body.removeChild(clone);},0);
            setTimeout(function(){card.style.opacity='0.3';},0);
        });
        card.addEventListener('dragend',function(){
            card.style.opacity='';
            list.querySelectorAll('.section-card').forEach(function(c){c.classList.remove('drag-over');});
        });
        card.addEventListener('dragover',function(e){
            e.preventDefault(); e.dataTransfer.dropEffect='move';
            if(card!==_dragSrc) card.classList.add('drag-over');
        });
        card.addEventListener('dragleave',function(){card.classList.remove('drag-over');});
        card.addEventListener('drop',function(e){
            e.preventDefault(); card.classList.remove('drag-over');
            if(!_dragSrc||_dragSrc===card) return;
            var cards=Array.from(list.querySelectorAll('.section-card'));
            if(cards.indexOf(_dragSrc)<cards.indexOf(card)) list.insertBefore(_dragSrc,card.nextSibling);
            else list.insertBefore(_dragSrc,card);
            var newOrder=Array.from(list.querySelectorAll('.section-card')).map(function(c){return c.dataset.uuid;});
            sectionRegistry.sort(function(a,b){return newOrder.indexOf(a.uuid)-newOrder.indexOf(b.uuid);});
            persistSectionOrder();
        });
    });
}

// ── Remove section ────────────────────────────────────────────────────────────
async function removeSection(uuid){
    await api('/__preview/api/page-sections/'+page+'/'+encodeURIComponent(uuid),{method:'DELETE'});
    sectionRegistry=sectionRegistry.filter(function(s){return s.uuid!==uuid;});
    buildSectionCards(sectionRegistry);
    status('تم حذف القسم ✓');
}

// ── Reorder ───────────────────────────────────────────────────────────────────
async function persistSectionOrder(){
    var order=sectionRegistry.map(function(s){return s.uuid;});
    await api('/__preview/api/page-sections/'+page+'/reorder',{method:'POST',body:JSON.stringify({order:order})});
    status('تم الترتيب ✓');
}

// ── Add section drawer ────────────────────────────────────────────────────────
var addDrawer = null;

function getAddDrawer(){
    if(addDrawer) return addDrawer;
    var el=document.createElement('div');
    el.id='addSectionDrawer';
    // position fixed, slides from right on top of everything
    el.style.cssText=[
        'position:fixed',
        'top:0','bottom:0',
        'right:0',
        'width:320px',
        'background:#fff',
        'z-index:200',
        'display:flex',
        'flex-direction:column',
        'box-shadow:-4px 0 24px rgba(0,0,0,.15)',
        'transform:translateX(100%)',
        'transition:transform .28s cubic-bezier(.4,0,.2,1)',
        'font-family:Cairo,sans-serif',
        'direction:rtl'
    ].join(';');
    el.innerHTML=
        '<div style="padding:14px 20px;border-bottom:1px solid #e8ecf0;display:flex;align-items:center;gap:12px;flex-shrink:0">'+
            '<button id="addDrawerBack" style="width:30px;height:30px;border-radius:7px;background:#f4f6f8;border:1px solid #e8ecf0;cursor:pointer;font-size:16px;color:#6b7280;display:flex;align-items:center;justify-content:center;flex-shrink:0">→</button>'+
            '<div>'+
                '<div style="font-size:11px;color:#6b7280;margin-bottom:1px">اختر قسماً لإضافته</div>'+
                '<div style="font-size:15px;font-weight:700;color:#1a1d23">إضافة قسم</div>'+
            '</div>'+
        '</div>'+
        '<div id="addDrawerList" style="flex:1;overflow-y:auto;padding:12px 14px 40px"></div>';
    document.body.appendChild(el);

    document.getElementById('addDrawerBack').addEventListener('click', closeAddDrawer);

    // Separate overlay for the add drawer
    var ov=document.createElement('div');
    ov.id='addDrawerOverlay';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.25);z-index:199;display:none';
    ov.addEventListener('click', closeAddDrawer);
    document.body.appendChild(ov);

    addDrawer=el;
    return el;
}

function openAddDrawer(){
    var d=getAddDrawer();
    var list=document.getElementById('addDrawerList');
    var ov=document.getElementById('addDrawerOverlay');

    list.innerHTML='<div style="text-align:center;padding:30px;color:#6b7280;font-size:13px">جاري التحميل…</div>';
    d.style.transform='translateX(0)';
    if(ov) ov.style.display='block';

    // دايماً اجيب كل sections الثيم من السيرفر بدون surface filter
    api('/__preview/api/sections/all')
        .catch(function(){
            // لو /all مش شغال جرب بدون surface
            return api('/__preview/api/sections');
        })
        .then(function(all){
            // normalize: ممكن يجي array أو object فيه items
            var items = Array.isArray(all) ? all : [];
            if(!items.length) items = sectionRegistry.slice();

            allThemeSections = items;

            // عرض كل sections بدون filter — المستخدم يختار اللي يضيفه
            renderAddList(list, items);
        })
        .catch(function(e){
            list.innerHTML='<div style="padding:20px;color:#ef4444;font-size:13px">خطأ في التحميل: '+e.message+'</div>';
        });
}

function renderAddList(list, items){
    if(!items.length){
        list.innerHTML='<div style="text-align:center;padding:40px 20px;color:#6b7280;font-size:13px">لا توجد أقسام متاحة.</div>';
        return;
    }

    var existingSlugs = sectionRegistry.map(function(s){return s.slug;});

    list.innerHTML = items.map(function(sec){
        var name    = resolveName(sec.name, sec.slug);
        var onPage  = existingSlugs.indexOf(sec.slug) >= 0;
        var opacity = onPage ? 'opacity:.45;' : '';
        var cursor  = onPage ? 'cursor:default;' : 'cursor:pointer;';
        return '<div class="add-sec-card" data-slug="'+ea(sec.slug)+'" data-on-page="'+(onPage?'1':'0')+'" style="'+
            'display:flex;align-items:center;gap:10px;'+
            'padding:10px 12px;'+
            'background:#fff;border:1px solid #e8ecf0;border-radius:10px;'+
            'margin-bottom:8px;transition:all .15s;'+
            opacity+cursor+'">'+
            '<div style="width:34px;height:34px;border-radius:8px;background:#f4f6f8;border:1px solid #e8ecf0;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">'+
                sectionIcon(sec.slug)+
            '</div>'+
            '<div style="flex:1;min-width:0">'+
                '<div style="font-size:13px;font-weight:600;color:#1a1d23;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+eh(name)+'</div>'+
                '<div style="font-size:11px;color:#6b7280">'+eh(sec.slug)+'</div>'+
            '</div>'+
            (onPage
                ? '<span style="font-size:11px;color:#1ab394;background:#f0fdf9;border:1px solid #a7f3d0;border-radius:999px;padding:2px 8px;flex-shrink:0">موجود</span>'
                : '<span style="color:#1ab394;font-size:22px;font-weight:200;flex-shrink:0;line-height:1">+</span>'
            )+
        '</div>';
    }).join('');

    list.querySelectorAll('.add-sec-card').forEach(function(card){
        if(card.dataset.onPage === '1') return; // موجود بالفعل
        card.addEventListener('click', function(){
            closeAddDrawer();
            addSection(card.dataset.slug);
        });
        card.addEventListener('mouseenter', function(){
            card.style.borderColor='#1ab394';
            card.style.background='#f0fdf9';
        });
        card.addEventListener('mouseleave', function(){
            card.style.borderColor='#e8ecf0';
            card.style.background='#fff';
        });
    });
}

function closeAddDrawer(){
    var d=document.getElementById('addSectionDrawer');
    var ov=document.getElementById('addDrawerOverlay');
    if(d)  d.style.transform='translateX(100%)';
    if(ov) ov.style.display='none';
}

function openAddModal(){
    var overlay=document.getElementById('addSectionOverlay');
    var grid=document.getElementById('addSectionGrid');
    if(!overlay||!grid) return;
    grid.innerHTML='<div class="empty-state">جاري التحميل…</div>';
    overlay.classList.add('open');
    api('/__preview/api/sections/all?page_type='+encodeURIComponent(page))
        .then(function(all){
            var items=Array.isArray(all)?all:[];
            if(!items.length){ grid.innerHTML='<div class="empty-state">لا توجد أقسام متاحة.</div>'; return; }
            var existingSlugs=sectionRegistry.map(function(s){return s.slug;});
            grid.innerHTML=items.map(function(sec){
                var name=resolveName(sec.name,sec.slug);
                var onPage=existingSlugs.indexOf(sec.slug)>=0;
                return '<div class="add-section-option'+(onPage?' on-page':'')+
                    '" data-slug="'+ea(sec.slug)+'" data-on-page="'+(onPage?'1':'0')+
                    '" style="'+(onPage?'opacity:.45;cursor:default;':'')+
                    '" title="'+ea(name)+'">'+
                    '<span class="aso-icon">'+sectionIcon(sec.slug)+'</span>'+
                    '<span class="aso-name">'+eh(name)+'</span>'+
                    (onPage?'<span style="font-size:9px;color:#1ab394;margin-top:1px">موجود</span>':'')+
                    '</div>';
            }).join('');
            grid.querySelectorAll('.add-section-option:not(.on-page)').forEach(function(card){
                card.addEventListener('click',function(){
                    closeAddModal();
                    addSection(card.dataset.slug);
                });
            });
        })
        .catch(function(e){
            grid.innerHTML='<div class="empty-state" style="color:#ef4444">خطأ: '+eh(e.message)+'</div>';
        });
}
function closeAddModal(){
    var overlay=document.getElementById('addSectionOverlay');
    if(overlay) overlay.classList.remove('open');
}

async function addSection(slug){
    status('جاري الإضافة…');
    var newSec=await api('/__preview/api/page-sections/'+page,{method:'POST',body:JSON.stringify({slug:slug})});
    // Ensure name is set correctly
    if(!newSec.name) newSec.name=slug;
    // Add to registry and rebuild UI immediately for responsiveness
    sectionRegistry.push(newSec);
    buildSectionCards(sectionRegistry);
    status('تمت إضافة القسم ✓');
}

// ── Load sections list ────────────────────────────────────────────────────────
async function loadSections(){
    document.getElementById('sectionList').innerHTML='<div class="empty-state"><div class="empty-state-icon">⊞</div>جاري التحميل…</div>';
    sectionRegistry=await api('/__preview/api/sections?surface='+page);

    // Load ALL theme sections for the "add" drawer
    // Try /sections/all first, fall back to /sections (no surface filter = all sections)
    try {
        var all = await api('/__preview/api/sections/all');
        allThemeSections = Array.isArray(all) ? all : [];
    } catch(e) {
        // Fallback: load sections without surface filter — returns all theme sections
        try {
            var all2 = await api('/__preview/api/sections');
            allThemeSections = Array.isArray(all2) ? all2 : [];
        } catch(e2) {
            allThemeSections = [];
        }
    }

    // If still empty, use sectionRegistry as base and show all of them
    if(!allThemeSections.length) allThemeSections = sectionRegistry.slice();

    console.log('[customizer] sectionRegistry:', sectionRegistry.length, 'allThemeSections:', allThemeSections.length);

    buildSectionCards(sectionRegistry);
    status('تم تحميل الأقسام');
}

// Wire buttons
document.getElementById('reloadSectionsBtn').addEventListener('click',function(){loadSections().catch(function(e){status(e.message,true);});});
var addBtn=document.getElementById('addSectionBtn');
if(addBtn) addBtn.addEventListener('click',openAddModal);
var _cm=document.getElementById('closeAddModal'); if(_cm) _cm.addEventListener('click',closeAddModal);
var _ao=document.getElementById('addSectionOverlay'); if(_ao) _ao.addEventListener('click',closeAddModal);

// ── Theme settings ────────────────────────────────────────────────────────────
async function loadThemeSettings(){
    var container=document.getElementById('themeFields');
    var payload;
    try{payload=await api('/__preview/api/theme-settings');}
    catch(err){container.innerHTML='<p style="color:#ef4444;font-size:13px;padding:8px 0">تعذر تحميل إعدادات الثيم: '+err.message+'</p>';return;}
    themeGroups=payload.groups||[];
    var seeded={};
    themeGroups.forEach(function(g){(g.settings||[]).forEach(function(f){if(f.id)seeded[f.id]=getDefault(f);});});
    themeValues=Object.assign(seeded,payload.values||{});
    if(!themeGroups.length){container.innerHTML='<p style="color:#6b7280;font-size:13px;padding:8px 0">لا توجد إعدادات ثيم محددة.</p>';return;}
    container.innerHTML=themeGroups.map(function(g){
        return '<div class="group-title">'+eh(g.name||'إعدادات')+'</div>'+(g.settings||[]).map(function(f){return renderField(f,themeValues);}).join('');
    }).join('');
    var allF=themeGroups.reduce(function(acc,g){return acc.concat(g.settings||[]);  },[]);
    initPickerFields(allF,themeValues,container);
    bindLinkPickers(container);
    container.querySelectorAll('input,select,textarea').forEach(function(el){
        el.addEventListener('input',scheduleThemeSave);
        el.addEventListener('change',scheduleThemeSave);
    });
    bindImageUploads(container);
}

var _themeTimer=null;
function scheduleThemeSave(){
    if(isReadOnly) return;
    clearTimeout(_themeTimer);
    _themeTimer=setTimeout(function(){saveThemeSettings().catch(function(e){status(e.message,true);});},700);
}

async function saveThemeSettings(){
    var allF=themeGroups.reduce(function(acc,g){return acc.concat(g.settings||[]);  },[]);
    var vals=collectValues(allF,document.getElementById('themeFields'));
    await api('/__preview/api/theme-settings',{method:'POST',body:JSON.stringify({settings:vals})});
    status('تم حفظ الثيم ✓');
    // الـ server بيبعت broadcast('reload') تلقائياً
}

function bind(id,fn){var el=document.getElementById(id);if(el)el.addEventListener('click',function(){fn().catch(function(e){status(e.message,true);});});}
bind('saveThemeSettingsBtn',saveThemeSettings);
bind('reloadThemeSettingsBtn',loadThemeSettings);

// ── Boot ──────────────────────────────────────────────────────────────────────
Promise.all([loadSections(),loadThemeSettings()]).catch(function(e){status(e.message,true);});

})();