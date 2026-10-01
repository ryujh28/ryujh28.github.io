/* Tutorial shell — adds a top bar, a guide drawer, contextual "?" help on panel headings and a first-visit hint
   to any tutorial page. A tutorial provides window.TUTORIAL before this script runs (usually from guide.js):
     { id, title, tests?: "tests.html",
       guide: "<section id='...'><h3>...</h3>...</section>...",   // guide content, one <section> per topic
       help: [ ["selector", /heading text/, "section-id"], ... ] } // where to put "?" buttons
   The drawer opens with the Guide button, the ? key, a "?" button, or #guide / #guide:section-id in the URL. */
(function(){
  var T=window.TUTORIAL||{}; var store={get:function(k){try{return localStorage.getItem(k);}catch(e){return null;}},set:function(k,v){try{localStorage.setItem(k,v);}catch(e){}}};
  var base=(document.currentScript&&document.currentScript.src)||""; var root=base.replace(/kit\/shell\.js.*$/,"");  // …/tutorials/
  function el(tag,attrs,html){var e=document.createElement(tag);for(var k in attrs||{}) e.setAttribute(k,attrs[k]); if(html!=null) e.innerHTML=html; return e;}
  document.body.classList.add("tk");

  // top bar
  var bar=el("header",{"class":"tk-bar"});
  bar.innerHTML='<nav class="tk-crumbs" aria-label="Breadcrumb"><a class="home" href="'+root+'../">Jae Hyun Ryu</a><span class="sep first">/</span><a href="'+root+'">Tutorials</a><span class="sep">/</span><b>'+(T.title||document.title)+'</b></nav>'
    +'<span class="tk-sp"></span>'
    +(T.tests?'<a class="tk-btn tk-hide-sm" href="'+T.tests+'">Verification tests</a>':'')
    +(T.back?'<a class="tk-btn" href="'+T.back[0]+'">'+T.back[1]+'</a>':'')
    +(T.guide?'<button class="tk-btn" id="tk-guide-btn" type="button" aria-expanded="false" aria-controls="tk-drawer">Guide <kbd>?</kbd></button>':'');
  document.body.prepend(bar);
  if(!T.guide) return;

  // drawer
  var dr=el("aside",{"class":"tk-drawer",id:"tk-drawer","aria-label":"Guide","aria-hidden":"true"});
  dr.innerHTML='<div class="tk-dh"><h2>Guide</h2><button class="tk-x" type="button" aria-label="Close guide">×</button></div><nav class="tk-toc"></nav><div class="tk-body">'+T.guide+'</div>';
  document.body.appendChild(dr);
  var body=dr.querySelector(".tk-body"), toc=dr.querySelector(".tk-toc"), btn=document.getElementById("tk-guide-btn");
  var secs=[].slice.call(body.querySelectorAll("section[id]"));
  toc.innerHTML=secs.map(function(s){var h=s.querySelector("h3"); return '<a href="#guide:'+s.id+'" data-id="'+s.id+'">'+(s.dataset.short||(h?h.textContent:s.id))+'</a>';}).join("");
  function setCur(id){[].forEach.call(toc.children,function(a){a.classList.toggle("cur",a.dataset.id===id);});}
  body.addEventListener("scroll",function(){var top=body.getBoundingClientRect().top+40,cur=secs[0]&&secs[0].id;secs.forEach(function(s){if(s.getBoundingClientRect().top<=top) cur=s.id;});setCur(cur);},{passive:true});
  function open(id){
    dr.classList.add("open"); dr.setAttribute("aria-hidden","false"); btn.classList.add("on"); btn.setAttribute("aria-expanded","true"); document.body.classList.add("tk-guide-open");
    var s=id&&document.getElementById(id);
    if(s&&body.contains(s)){ body.scrollTop+=s.getBoundingClientRect().top-body.getBoundingClientRect().top-6; s.classList.remove("flash"); void s.offsetWidth; s.classList.add("flash"); setCur(id); }
    store.set("tk-seen-"+T.id,"1"); hideHint();
  }
  function close(){ dr.classList.remove("open"); dr.setAttribute("aria-hidden","true"); btn.classList.remove("on"); btn.setAttribute("aria-expanded","false"); document.body.classList.remove("tk-guide-open");
    if(/^#guide/.test(location.hash)) history.replaceState(null,"",location.pathname+location.search); }
  btn.addEventListener("click",function(){ dr.classList.contains("open")?close():open(); });
  dr.querySelector(".tk-x").addEventListener("click",close);
  toc.addEventListener("click",function(e){var a=e.target.closest("a"); if(!a) return; e.preventDefault(); open(a.dataset.id);});
  body.addEventListener("click",function(e){var a=e.target.closest('a[href^="#guide:"]'); if(!a) return; e.preventDefault(); open(a.getAttribute("href").slice(7));});
  document.addEventListener("keydown",function(e){
    var t=e.target, typing=t&&(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable);
    if(e.key==="Escape"&&dr.classList.contains("open")) close();
    else if(e.key==="?"&&!typing&&!e.metaKey&&!e.ctrlKey){ e.preventDefault(); dr.classList.contains("open")?close():open(); }
  });
  function fromHash(){ var m=location.hash.match(/^#guide(?::(.+))?$/); if(m) open(m[1]); }
  window.addEventListener("hashchange",fromHash);

  // contextual help: a "?" button after matching headings (re-applied when the page rebuilds its panels)
  function addHelp(){
    (T.help||[]).forEach(function(r){
      document.querySelectorAll(r[0]).forEach(function(h){
        if(h.querySelector(".tk-help")||h.closest(".tk-drawer")) return;
        if(!r[1].test(h.textContent)) return;
        var b=el("button",{"class":"tk-help",type:"button","aria-label":"Explain: "+h.textContent.trim().split("\n")[0],title:"What is this?"},"?");
        b.addEventListener("click",function(e){e.stopPropagation(); open(r[2]);});
        var tgt=h.querySelector("span")||h; tgt.appendChild(b);
      });
    });
  }
  var pend=false; new MutationObserver(function(){ if(pend) return; pend=true; requestAnimationFrame(function(){pend=false; addHelp();}); }).observe(document.body,{childList:true,subtree:true});
  addHelp();

  // first visit: one quiet hint, bottom left
  var hint=null;
  function hideHint(){ if(hint){ hint.remove(); hint=null; } }
  if(!store.get("tk-seen-"+T.id)&&!/^#guide/.test(location.hash)){
    hint=el("div",{"class":"tk-hint",role:"status"});
    hint.innerHTML='<p>'+(T.hint||"Change any input and the results update as you go. The guide explains what each panel shows.")+'</p><div class="row"><button class="tk-btn on" type="button" data-a="open">Open the guide</button><button class="tk-btn" type="button" data-a="skip">Got it</button></div>';
    hint.addEventListener("click",function(e){var a=e.target.closest("button"); if(!a) return; store.set("tk-seen-"+T.id,"1"); if(a.dataset.a==="open") open(); hideHint();});
    document.body.appendChild(hint);
  }
  fromHash();
})();
