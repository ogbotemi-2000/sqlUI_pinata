function save(blob, name, result) {
  name = name || 'download';

  // Use native saveAs in IE10+
  if (typeof navigator !== "undefined") {
      if (/MSIE [1-9]\./.test(navigator.userAgent)) {
          alert('IE is unsupported before IE10');
          return;
      }
      if (navigator.msSaveOrOpenBlob) {
          // https://msdn.microsoft.com/en-us/library/hh772332(v=vs.85).aspx
          alert('will download using IE10+ msSaveOrOpenBlob');
          navigator.msSaveOrOpenBlob(blob, name);
          return;
      }
  }

  // Construct URL object from blob
  var win_url = window.URL || window.webkitURL || window;
  var url = win_url.createObjectURL(blob);

  // Use a.download in HTML5
  var a = document.createElementNS('http://www.w3.org/1999/xhtml', 'a');
  if ('download'in a) {
      alert(`${location.host} has provided the \`{ query${', response'.repeat(!!result)} }\` object to your browser for download`);
      a.href = url;
      a.download = name;
      a.dispatchEvent(new MouseEvent('click'));
      // Don't revoke immediately, as it may prevent DL in some browsers
      setTimeout(function() {
          win_url.revokeObjectURL(url);
      }, 500);
      return;
  }
}

const Ev = node=>ev=>(cb, obj)=>/^on/.test(ev)?node[ev]=cb:node[node.attachEvent?'attachEvent':'addEventListener'](ev, cb, obj),
      w_Ev = Ev(window), w_Ev_dom = w_Ev('DOMContentLoaded'), w_Ev_rz = w_Ev('resize'),
      w_Ev_scroll = w_Ev('scroll'),
      cLs =bool=>bool?'add':'remove';

/*self contained component*/
function grow_shrink(e,i,c,n,d,k, cls){
  d=grow_shrink,n={500:'base',640:'sm',768:'md',1024:'lg',1280:'xl'},
  c=document.createElement("div"),
  !d.cached&&(d.cached={}),!d.arr&&(d.arr=[].slice.call((d.el=window.growShrink).querySelectorAll(".fluid"))),
  !d.dump&&(d.dump=d.el.querySelector("a+div>div")),
  (e=(k=Object.keys(n).filter((c,n)=>(i=n,c>e)))[0]), k = new RegExp(k.map(e=>n[e]+':show').join('|')),
  d.vw!==e&&!d.cached[d.vw=e]&&d.arr.forEach((n,r,o)=>{
    (n=n.cloneNode(!0)).classList.add(c.className=d.el.getAttribute('data-classname'));
    if(((cls=n.classList)+'').match(k)) cls.remove('clicked'), (cls+'').replace(/(base|sm|md|lg|xl):show/, function(a) {
      cls.remove(a, 'fluid')
    }), /* n.className=l?"clicked":"",*/ c.appendChild(n), !d.cached[e]&&(d.cached[e]=c)
  }),d.dump.replaceChild(d.cached[e]||c,d.dump.firstChild)}

w_Ev_dom(_=>{
  window.growShrink&&(grow_shrink(innerWidth), w_Ev_rz(_=>{
    grow_shrink(innerWidth)
  }))
})


function byteFormat(num, res='') {
  if(num<1024) {
    res = num+' bytes';
  } else if(1024<=num&&num<1048576) {
    res += num/1024,
    res = res.slice(0, res.indexOf('.')+3) /*3-1 dp*/+' KB'
  } else {
    res += num/1048576,
    res = res.slice(0, res.indexOf('.')+3) /*3-1 dp*/+' MB'
  }
  return res
}

function minMax(obj, isRem, arr=['min','max'], vary, cnst, fn, str) {
  minMax.switch = fn = (value, isRem) => isRem ? value*16 : value/16,
    
  arr.forEach((e, i, arr, max)=>{
    arr[i] = obj[e], max = arr[2+i] = obj['v'+e],
    !i ? vary = (obj[arr[1+i]] - arr[i])/(obj['v'+arr[i+1]] - max) : (cnst = (arr[i] - max * vary)/16, str = `clamp(${fn(arr[i-1], false)}rem, ${cnst.toFixed(3)}rem + ${(100*vary).toFixed(2)}vw, ${fn(arr[i], false)}rem) `)
  });
  return str
}

function relation(parent, child) {
    return [parent.compareDocumentPosition(child)&Node.DOCUMENT_POSITION_CONTAINED_BY,
            parent.compareDocumentPosition(child)&Node.DOCUMENT_POSITION_CONTAINS]
}

  let Abbr={
    dict: function(arr) {
      arr.forEach((str, abbr)=>{
        abbr=str.charAt(0), str.replace(/[A-Z]/g, a=>abbr+=a),
        (this.__dict||={})[abbr] = str
      })
    },
    to  : function(node, arg, flag, dict, arr) {
      dict = this.__dict, str='', arr = Array.isArray(arg)?arg:[arg];
      for(let e, p=[], k=0, j=arr.length; p=[], e=arr[k], k<j; k++) {
        if(typeof e==="object") {
          if(e.at) p=e;/**short method of arrays */
          else { for(let i in e) { (e[i]+' ').repeat(i).split(/\s+/).forEach(e=>e&&p.push(e)) } } 
        }
        else p=[e];
        p.find((str, v, bool)=>((v=node[str]||node[dict[str]])?node=v:/*break*/!flag&&(k=j), !v))
      }
      return node
    }
   };
  Abbr.dict(['textContent', 'childNodes', 'classList', 'parentNode', 'previousElementSibling', 'nextElementSibling', 'nextSibling', 'firstChild', 'firstElementChild', 'lastChild', 'lastElementChild']);

  function copyTextToClipboard(text) {
    var textArea = document.createElement("textarea");
  
    textArea.style.position = 'fixed';
    textArea.style.top = 0;
    textArea.style.left = 0;
  
    // Ensure it has a small width and height. Setting to 1px / 1em
    // doesn't work as this gives a negative w/h on some browsers.
    textArea.style.width = '2em';
    textArea.style.height = '2em';
  
    // We don't need padding, reducing the size if it does flash render.
    textArea.style.padding = 0;
  
    // Clean up any borders.
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
  
    // Avoid flash of the white box if rendered for any reason.
    ['color', 'background'].forEach(e=>textArea.style[e] = 'transparent'),
    textArea.value = text;
  
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    let msg;
    try {
      var successful = document.execCommand('copy');
      msg = successful ? 'copied' : 'failed to copy';
    } catch (err) {
      msg = 'cannot copy; no support'
    }
    document.body.removeChild(textArea);
    return msg
  }