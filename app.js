(function(){
  var KEY="planejador-compras-v1", items=[];
  var brl=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
  var $=function(id){return document.getElementById(id)};

  var ROOMS=[["cozinha","Cozinha"],["quarto","Quarto"],["banheiro","Banheiro"],["sala","Sala"],["outro","Outro"]];
  var ROOM_NAME={},PRIO_NAME={alta:"Alta",media:"Média",baixa:"Baixa"};
  ROOMS.forEach(function(r){ROOM_NAME[r[0]]=r[1]});
  var hoverRoom=null, selRoom=null, roomData={}, grandTotal=0;

  /* ===== BANCO DE DADOS / SUPABASE ===== */
  var usuarioAtual = null;
  function aviso(msg, erro){
    var el=$('status');
    el.textContent=msg || '';
    el.classList.toggle('erro',!!erro);
  }
  function normalizar(it){
    return {id:it.id,nome:it.nome,valor:Number(it.valor),url:it.url||'',
      comodo:ROOM_NAME[it.comodo]?it.comodo:'outro',
      prio:PRIO_NAME[it.prio]?it.prio:'media',data:it.data,
      pg:it.pg,parcelas:it.parcelas};
  }
  async function carregar(){
    var todos=[], inicio=0, tamanho=500;
    while(true){
      var {data,error}=await supabaseClient.from('planned_purchases')
        .select('id,nome,valor,url,comodo,prio,data,pg,parcelas')
        .order('data',{ascending:true}).order('id',{ascending:true})
        .range(inicio,inicio+tamanho-1);
      if(error)throw error;
      todos.push.apply(todos,data||[]);
      if(!data || data.length<tamanho)break;
      inicio+=tamanho;
    }
    items=todos.map(normalizar);
    render();
  }
  function comprasLocais(){
    try{var a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[]}
    catch(e){return []}
  }
  function atualizarMigracao(){
    $('migracao').hidden=!comprasLocais().length;
  }
  async function iniciar(){
    try{
      var {data,error}=await supabaseClient.auth.getUser();
      if(error || !data.user){location.replace('login.html');return}
      usuarioAtual=data.user;
      $('emailUsuario').textContent=usuarioAtual.email||'';
      await carregar();
      atualizarMigracao();
      aviso('');
      $('layout').hidden=false;
    }catch(e){aviso('Não foi possível carregar suas compras: '+e.message,true)}
  }

  /* ===== UTILITÁRIOS (datas, moeda, segurança do texto) ===== */
  function parseDate(s){var p=s.split("-");return {y:+p[0],m:+p[1]-1,d:+p[2]}}
  function monthLabel(k){var y=Math.floor(k/12),m=k%12;return new Date(y,m,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}
  function fmtDate(s){var p=parseDate(s);return new Date(p.y,p.m,p.d).toLocaleDateString("pt-BR")}
  function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
  function safeUrl(u){
    u=(u||"").trim();if(!u)return "";
    if(!/^[a-z][a-z0-9+.-]*:/i.test(u))u="https://"+u;
    try{var x=new URL(u);return /^https?:$/.test(x.protocol)?x.href:""}catch(e){return ""}
  }

  /* ===== REGRAS DE CÁLCULO (divisão das parcelas por mês) ===== */
  // Gera as cobranças de uma compra: [{key, amount, n, total}]
  function charges(it){
    var d=parseDate(it.data), start=d.y*12+d.m, cents=Math.round(it.valor*100);
    var n=it.pg==="parcelado"?it.parcelas:1, base=Math.floor(cents/n), rest=cents-base*n, out=[];
    for(var i=0;i<n;i++)out.push({key:start+i,amount:(base+(i===0?rest:0))/100,n:i+1,total:n});
    return out;
  }

  /* ===== FILTROS (busca, pagamento e intervalo de meses) ===== */
  function monthKey(v){if(!v)return null;var p=v.split("-");return +p[0]*12+(+p[1]-1)}
  function getFilters(){return {q:$("fBusca").value.trim().toLowerCase(),pg:$("fPg").value,com:$("fCom").value,prio:$("fPrio").value,de:monthKey($("fDe").value),ate:monthKey($("fAte").value)}}
  function passa(it,F){return (!F.q||it.nome.toLowerCase().indexOf(F.q)>-1)&&(!F.pg||it.pg===F.pg)&&(!F.com||it.comodo===F.com)&&(!F.prio||it.prio===F.prio)}

  /* ===== TELA (desenha resumo, meses e lista) ===== */
  function render(){
    var byMonth={}, byRoom={}, grand=0;
    var F=getFilters();
    items.filter(function(it){return passa(it,F)}).forEach(function(it){charges(it).forEach(function(c){
      if((F.de!==null&&c.key<F.de)||(F.ate!==null&&c.key>F.ate))return;
      (byMonth[c.key]=byMonth[c.key]||{sum:0,list:[]});
      byMonth[c.key].sum+=c.amount;byMonth[c.key].list.push({it:it,c:c});grand+=c.amount;byRoom[it.comodo]=(byRoom[it.comodo]||0)+c.amount;
    })});
    var keys=Object.keys(byMonth).map(Number).sort(function(a,b){return a-b});
    var max=keys.reduce(function(m,k){return Math.max(m,byMonth[k].sum)},0);

    renderPizza(byRoom,grand);

    var tot=$("totals");
    if(!keys.length){tot.innerHTML="";$("meses").innerHTML='<p class="empty">'+(items.length?'Nenhum gasto encontrado com esses filtros.':'Nenhuma compra ainda. Adicione a primeira no planejador para ver o gasto mensal.')+'</p>'}
    else{
      var peak=keys.reduce(function(a,k){return byMonth[k].sum>byMonth[a].sum?k:a},keys[0]);
      tot.innerHTML='<div><span class="num">'+brl.format(grand)+'</span><span class="l">Total planejado</span></div>'+
        '<div><span class="num">'+brl.format(byMonth[peak].sum)+'</span><span class="l">Mês mais pesado: '+esc(monthLabel(peak))+'</span></div>';
      $("meses").innerHTML=keys.map(function(k){
        var m=byMonth[k], pct=max?Math.max(2,m.sum/max*100):0;
        var det=m.list.map(function(x){
          var tag=x.c.total>1?'<span class="tag">parcela '+x.c.n+'/'+x.c.total+'</span>':'';
          return '<li><span>'+esc(x.it.nome)+tag+'</span><span class="num">'+brl.format(x.c.amount)+'</span></li>';
        }).join("");
        return '<div class="mrow"><span class="mname">'+esc(monthLabel(k))+'</span>'+
          '<div class="track" role="img" aria-label="'+brl.format(m.sum)+'"><div class="fill" style="width:'+pct+'%"></div></div>'+
          '<span class="mval num">'+brl.format(m.sum)+'</span>'+
          '<details><summary>'+m.list.length+(m.list.length>1?' lançamentos':' lançamento')+'</summary><ul class="det">'+det+'</ul></details></div>';
      }).join("");
    }

    var sorted=items.slice().sort(function(a,b){return a.data<b.data?-1:a.data>b.data?1:0});
    $("lista").innerHTML=sorted.length?sorted.map(function(it){
      var u=safeUrl(it.url), pg=it.pg==="parcelado"?it.parcelas+'x de '+brl.format(it.valor/it.parcelas):'À vista';
      return '<div class="item"><div><b>'+esc(it.nome)+'</b><div class="meta">'+fmtDate(it.data)+' · '+pg+' · <span class="room dot-'+it.comodo+'"><i></i>'+esc(ROOM_NAME[it.comodo])+'</span> · <span class="badge '+it.prio+'">Necessidade '+PRIO_NAME[it.prio].toLowerCase()+'</span>'+
        (u?' · <a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(new URL(u).hostname)+'</a>':'')+'</div></div>'+
        '<div style="text-align:right"><div class="num" style="font-weight:700">'+brl.format(it.valor)+'</div>'+
        '<button class="ghost" data-id="'+it.id+'" type="button">Remover</button></div></div>';
    }).join(""):'<p class="empty">Sua lista está vazia.</p>';
  }

  /* ===== GRÁFICO DE PIZZA (rosca interativa) ===== */
  function pctFmt(v,t){return (t?v/t*100:0).toLocaleString("pt-BR",{maximumFractionDigits:1})+"%"}
  function renderPizza(byRoom,grand){
    var box=$("pizza");
    roomData={};grandTotal=grand;
    if(!grand){box.innerHTML='<p class="empty">'+(items.length?'Nenhum gasto encontrado com esses filtros.':'Adicione uma compra para ver a divisão por cômodo.')+'</p>';return}
    var R=70,C=2*Math.PI*R,off=0,list=ROOMS.filter(function(r){return byRoom[r[0]]>0});
    if(selRoom&&!byRoom[selRoom])selRoom=null;
    var gap=list.length>1?2:0, slices="", legend="";
    list.forEach(function(r){
      var k=r[0],v=byRoom[k],len=v/grand*C,dash=Math.max(.5,len-gap);
      roomData[k]={n:r[1],v:v};
      slices+='<circle class="slice sl-'+k+'" data-room="'+k+'" cx="100" cy="100" r="'+R+'" stroke-dasharray="'+dash.toFixed(2)+' '+(C-dash).toFixed(2)+'" stroke-dashoffset="'+(-(off+gap/2)).toFixed(2)+'" transform="rotate(-90 100 100)" tabindex="0" role="button" aria-label="'+r[1]+': '+brl.format(v)+' ('+pctFmt(v,grand)+')"/>';
      legend+='<li><button type="button" class="lg dot-'+k+'" data-room="'+k+'"><span class="dot"></span><span>'+r[1]+'</span><span class="num">'+brl.format(v)+'</span><span class="pct">'+pctFmt(v,grand)+'</span></button></li>';
      off+=len;
    });
    box.innerHTML='<div class="pizza" id="pz"><svg viewBox="0 0 200 200" role="group" aria-label="Gráfico de gasto por cômodo">'+
      '<circle cx="100" cy="100" r="'+R+'" fill="none" stroke="var(--line)" stroke-width="26" opacity=".35"/>'+slices+
      '<text class="c-lbl" id="cLbl" x="100" y="92" text-anchor="middle"></text>'+
      '<text class="c-val num" id="cVal" x="100" y="113" text-anchor="middle"></text>'+
      '<text class="c-sub" id="cSub" x="100" y="130" text-anchor="middle"></text></svg>'+
      '<ul class="legend">'+legend+'</ul></div>';
    updatePizza();
  }
  function updatePizza(){
    var pz=$("pz");if(!pz)return;
    var a=hoverRoom||selRoom, d=a&&roomData[a];
    pz.classList.toggle("has-active",!!d);
    pz.querySelectorAll("[data-room]").forEach(function(el){el.classList.toggle("on",el.getAttribute("data-room")===a)});
    $("cLbl").textContent=d?d.n:"Total planejado";
    $("cVal").textContent=brl.format(d?d.v:grandTotal);
    $("cSub").textContent=d?pctFmt(d.v,grandTotal)+" do total":"todos os cômodos";
  }
  (function(){
    var box=$("pizza");
    function roomOf(e){var el=e.target.closest&&e.target.closest("[data-room]");return el?el.getAttribute("data-room"):null}
    box.addEventListener("mouseover",function(e){var k=roomOf(e);if(k!==hoverRoom){hoverRoom=k;updatePizza()}});
    box.addEventListener("mouseout",function(e){if(hoverRoom){hoverRoom=null;updatePizza()}});
    box.addEventListener("focusin",function(e){var k=roomOf(e);if(k){hoverRoom=k;updatePizza()}});
    box.addEventListener("focusout",function(){hoverRoom=null;updatePizza()});
    box.addEventListener("click",function(e){var k=roomOf(e);if(!k)return;selRoom=selRoom===k?null:k;updatePizza()});
    box.addEventListener("keydown",function(e){
      if((e.key==="Enter"||e.key===" ")&&e.target.classList.contains("slice")){e.preventDefault();var k=roomOf(e);selRoom=selRoom===k?null:k;updatePizza()}
    });
  })();

  /* ===== FORMULÁRIO E EVENTOS ===== */
  function updateHint(){
    var v=parseFloat($("valor").value), n=parseInt($("parc").value,10);
    $("parcHint").textContent=(v>0&&n>=2)?n+'x de aproximadamente '+brl.format(v/n):'';
  }
  function togglePg(){
    var p=document.querySelector('input[name="pg"]:checked').value==="parcelado";
    $("parcWrap").classList.toggle("hidden",!p);updateHint();
  }

  document.querySelectorAll('input[name="pg"]').forEach(function(r){r.addEventListener("change",togglePg)});
  $("valor").addEventListener("input",updateHint);$("parc").addEventListener("input",updateHint);

  $("form").addEventListener("submit",async function(e){
    e.preventDefault();
    var btn=this.querySelector('button[type="submit"]');
    var pg=document.querySelector('input[name="pg"]:checked').value;
    var parcelas=pg==="parcelado"?Math.min(48,Math.max(2,parseInt($("parc").value,10)||2)):1;
    var novo={nome:$("nome").value.trim(),valor:parseFloat($("valor").value),
      url:$("url").value.trim(),comodo:$("comodo").value,
      prio:document.querySelector('input[name="prio"]:checked').value,
      data:$("data").value,pg:pg,parcelas:parcelas};
    btn.disabled=true;
    try{
      var {data,error}=await supabaseClient.from('planned_purchases')
        .insert(novo).select('id,nome,valor,url,comodo,prio,data,pg,parcelas').single();
      if(error)throw error;
      items.push(normalizar(data));render();
      $("nome").value="";$("valor").value="";$("url").value="";
      updateHint();$("nome").focus();aviso('Compra adicionada.');
    }catch(e){aviso('Erro ao salvar compra: '+e.message,true)}
    finally{btn.disabled=false}
  });

  $("lista").addEventListener("click",async function(e){
    var b=e.target.closest('button[data-id]');if(!b)return;
    b.disabled=true;
    try{
      var id=b.getAttribute('data-id');
      var {error}=await supabaseClient.from('planned_purchases').delete().eq('id',id);
      if(error)throw error;
      items=items.filter(function(i){return i.id!==id});render();
      aviso('Compra removida.');
    }catch(err){b.disabled=false;aviso('Erro ao remover compra: '+err.message,true)}
  });

  /* botão "Ver só gastos" */
  $("btnSolo").addEventListener("click",function(){
    var solo=$("layout").classList.toggle("solo");
    this.textContent=solo?"Mostrar planejador":"Ver só gastos";
    this.setAttribute("aria-pressed",String(solo));
  });

  /* filtros */
  ["fBusca","fCom","fPrio","fPg","fDe","fAte"].forEach(function(id){
    $(id).addEventListener("input",render);$(id).addEventListener("change",render);
  });
  $("fLimpar").addEventListener("click",function(){
    ["fBusca","fCom","fPrio","fPg","fDe","fAte"].forEach(function(id){$(id).value=""});render();
  });

  $('btnLogout').addEventListener('click',async function(){
    this.disabled=true;
    var {error}=await supabaseClient.auth.signOut();
    if(error){aviso('Erro ao sair: '+error.message,true);this.disabled=false;return}
    location.replace('login.html');
  });

  $('btnMigrar').addEventListener('click',async function(){
    var antigos=comprasLocais();
    if(!antigos.length){atualizarMigracao();return}
    if(!confirm('Importar '+antigos.length+' compra(s) deste navegador para a conta '+usuarioAtual.email+'?'))return;
    this.disabled=true;
    try{
      var lote=antigos.map(function(it,i){
        return {user_id:usuarioAtual.id,legacy_id:String(it.id||('sem-id-'+i)),
          nome:String(it.nome||''),valor:Number(it.valor),url:it.url||'',
          comodo:ROOM_NAME[it.comodo]?it.comodo:'outro',
          prio:PRIO_NAME[it.prio]?it.prio:'media',data:it.data,
          pg:it.pg==='parcelado'?'parcelado':'vista',
          parcelas:it.pg==='parcelado'?Number(it.parcelas):1};
      });
      for(var i=0;i<lote.length;i+=100){
        var {error}=await supabaseClient.from('planned_purchases')
          .upsert(lote.slice(i,i+100),{onConflict:'user_id,legacy_id',ignoreDuplicates:true});
        if(error)throw error;
      }
      await carregar();
      aviso('Importação concluída. Confira as compras antes de apagar os dados locais.');
    }catch(e){aviso('Falha na importação: '+e.message+' (dados locais preservados)',true)}
    finally{this.disabled=false}
  });

  iniciar();
  
})();