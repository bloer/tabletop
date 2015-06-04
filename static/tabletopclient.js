var socket = io();
var graphicsLock=false;
var gamestate = {};

function showreleasenotes()
{
  $("#releasenotes").dialog("open");
  return false;
}

function centerme(element,to){
  element.css("position","absolute");
  to = to || element.parent();
  element.offset({
    left: to.offset().left + to.width()/2. - element.width()/2.,
    top: to.offset().top +to.height()/2. - element.height()/2.
  });
}

function toggleTransformHierarchy(element){
  if(!element || element.size()<1 || element == $("html"))
    return;
  element.toggleClass("notransform");
  return toggleTransformHierarchy(element.parent());
}



function scaletofit(element,to){
  to = to || element.parent();
  element.css({"transform":"none", "transform-origin":"center"});
  toggleTransformHierarchy(to);
  centerme(element,to);
  var x = to.innerWidth() / element.width();
  var y = to.innerHeight() / element.height();
  var min = x<y ? x : y;
  element.css("transform","scale("+min+")");
  toggleTransformHierarchy(to);
}

function getpoint(event,ignoreparent){
  parentpos = $(event.currentTarget).offset();
  var X = event.pageX, Y=event.pageY;
  if(X===undefined){//work with touches too
    X = event.originalEvent.touches[0].pageX;
    Y = event.originalEvent.touches[0].pageY;
  }
  if(ignoreparent)
    return [Math.round(X),Math.round(Y)];
  return [Math.round(X-parentpos.left),Math.round(Y-parentpos.top)];
}

function convertFile(source){
  var files = source.files;
  var file = files[0];
  var target = "#"+$(source).data("target");
  if (files && file) {
    var reader = new FileReader();
    reader.onload = function(readerEvt) {
      $(target).val(readerEvt.target.result);
      $(source).parent("form").get(0).submit();
    };
    reader.readAsDataURL(file);
  }
  return false;
}

function getActiveCanvasLayer(){
  return $("#layercontrols .layercontrol.active").data("layer");
}

function testimgurl(s){
  return (s.substr(0,5) == "data:" || s.indexOf('.')>-1)
}

function wrapimgurl(s){
  if(testimgurl(s))
    return "url('"+s+"')";
  return s;
}

function clearmaskzone_interactive(){
  if(!gamestate.background._applymask)
    return false;
  $("#whiteboard").animate({"opacity":0.5})
    .on("mousedown touchstart",function(event,ui){
      event.preventDefault();
      event.stopPropagation();
      var mask = $(this);
      var container = $("#whiteboard-container");
      var start = getpoint(event,true);
      var selector = $("<div id='clearmaskselector'></div>")
        .css({
            border:"3px dashed blue",
            position:"absolulte",
            'z-index':5,
            width:1,
            height:1
          })
        .appendTo(container)
        .offset({left:start[0],top:start[1]})
        ;
      container.on("touchmove mousemove",function(event,ui){
        event.preventDefault();
        event.stopPropagation();
        var mousept = getpoint(event,true);
        var newwidth = mousept[0]-start[0], newheight=mousept[1]-start[1];
        var newoffset = {left:start[0], top:start[1]};
        if(mousept[0]<start[0]){
            newoffset.left = mousept[0];
          }
          if(mousept[1]<start[1]){
            newoffset.top = mousept[1];
          }
          selector.offset(newoffset);
          selector.width(Math.abs(newwidth)).height(Math.abs(newheight));
      });
      container.on("mouseup touchend",function(event,ui){
        event.preventDefault();
        event.stopPropagation();
        var x = selector.offset().left - mask.offset().left;
        var y = selector.offset().top - mask.offset().top;
        var w = selector.width();
        var h = selector.height();
        zone = {'x':x,'y':y,'w':w,'h':h};
        socket.emit('clearmaskzone',zone);
        selector.remove();
        mask.off("mousedown touchstart")
          .animate({"opacity":1});
        container.off("mousemove touchmove mouseup touchend");
      });
  });
}

function setbackgroundcropping(){
  //see if it's cropped at all
  var selector = $("#cropselector");
  var img = $("#uncroppedbg");
  var data = {background:wrapimgurl(img.attr("src"))+" no-repeat",
              'background-size':"100% 100%"};
  var applymask = $("#applymask").is(":checked");
  data['_applymask'] = applymask;
  if(selector.size()){
    var target = $("#whiteboard-container");
    var xscale = (target.width() / selector.width());
    var yscale = (target.height() / selector.height());
    /*
    if($("#fillmax").is(":checked")){
      if(xscale > yscale)
        xscale = yscale;
      if(yscale > xscale)
        yscale = xscale;
    }
    */
    var initpos = selector.css("background-position").split(' ');
    var left = xscale*parseFloat(initpos[0]);
    var top = yscale*parseFloat(initpos[1]);
    data['background-size'] = img.width()*xscale+"px "+img.height()*yscale+"px";
    data['background-position'] = left+"px "+top+"px";
    data['background-repeat'] = 'no-repeat';
  }
  $("#bgimagecrop").dialog("close");
  setbackground(data,true);
}

function refreshwhiteboard()
{
  var wb = $("#whiteboard").get(0);
  var W = wb.width;
  var H = wb.height;
  var ctx = wb.getContext('2d');
  if(gamestate.background._applymask){
    ctx.fillStyle = '#f3f3f3';
    ctx.fillRect(0,0,W,H);
    if(gamestate.background._clearmaskzones){
      gamestate.background._clearmaskzones.forEach(function(zone){
        ctx.clearRect(zone.x, zone.y, zone.w, zone.h);
      });
    }
  }
  else{
    ctx.clearRect(0,0,W,H);
  }
  if(gamestate.grid && gamestate.grid.show){
    var oldwidth = ctx.lineWidth;
    ctx.lineWidth = 1;
    ctx.strokeStyle="#CCC";
    ctx.beginPath();
    var pitch = parseInt(gamestate.grid.pitch);
  
    if(gamestate.grid.show == "square"){
      var x = pitch;
      while(x < W){
        ctx.moveTo(x,0);
        ctx.lineTo(x,H);
        x += pitch;
      }
      var y = pitch;
      while(y<H){
        ctx.moveTo(0,y);
        ctx.lineTo(W,y);
        y += pitch;
      }
    }
    else if(gamestate.grid.show == "hex"){
      var x=0;
      var dy = pitch, dx = pitch*Math.sqrt(3);
      while(x<W){
        var y=0;
        while(y<H){
          ctx.moveTo(x,y);
          ctx.lineTo(x,y+dy);
          ctx.lineTo(x+dx/2., y+1.5*dy);
          ctx.lineTo(x+dx/2., y+2.5*dy);
          ctx.lineTo(x,y+3*dy);
          ctx.moveTo(x+dx/2., y+1.5*dy);
          ctx.lineTo(x+dx,y+dy);
          ctx.moveTo(x+dx/2., y+2.5*dy);
          ctx.lineTo(x+dx,y+3*dy);
          y+=3*dy;
        }
        x+=dx;
      }
    }
    ctx.stroke();
    ctx.lineWidth = oldwidth;
    
  }
  $.each(gamestate.layers,function(index,layer){
    if(layer.visible)
      layer.paths.forEach(drawpath);
  });
}

function setbackground(data,emit){
  if(!data){
    //this is invoked by the side form
    emit = true;
    var s = $("#setbackgroundbg").val();
    if(testimgurl(s)){
      //crop it first
      $("#uncroppedbg").attr("src",s);
      $("#bgimagecrop").dialog("open");
      return false;
    }
    data = {background:wrapimgurl($("#setbackgroundbg").val())}
  }
  if(emit)
    socket.emit('set background',data);
  else{
    gamestate.background = data;
    refreshwhiteboard();
    $("#whiteboard-container").css(data);
  }
  return false;
}

function clearlayer(data,emit){
  var layer = gamestate.layers[data.layer];
  if(layer)
    layer.paths = [];
  refreshwhiteboard();
  if(emit)
    socket.emit('clear layer',data);
}

function placemarker(markerdata){
  if(!markerdata)
    return;
  var marker = 
  $("<div class='marker' style='display:none' id='"+markerdata.id+"'></div>")
    //.data(markerdata)
    .toggleClass("circle",markerdata.circle)
    .toggleClass("threed",markerdata.threed)
    .append($("<div class=markerbody></div>")
      .css({ background:markerdata.bg+" no-repeat center top", 'background-size':'cover'}))
    //.text(markerdata.label)
    .append("<div class='markerbase'></div>")
    .appendTo("#whiteboard-container")
    .on('mousedown',function(event){ 
      event.stopPropagation(); 
      if(event.ctrlKey)
        $(this).draggable("option","helper","clone");
     })
     .on("dblclick",function(event){
        var label = $(this).find(".markerlabel");
        if(label.width() < 50) label.width(50);
        if(label.height() < 20) label.height(20); 
        $("<input type='text' style='position:absolute;width:100%;height:100%';>")
        .val(label.text())
        .appendTo(label).offset(label.offset()).focus().select()
        .on('change',function(event,ui){
          var marker = $(this).parents(".marker");
          label.text($(this).val());
          sendmarkerupdate(marker);
          scaletofit(label);
        });
     })
     .on("contextmenu",function(event){
       event.preventDefault();
       //if(event.which == 2)
        $(this).toggleClass("activated");
        $(this).data("_TT_marker").activated = $(this).hasClass("activated");
        sendmarkerupdate($(this));
     })
     ;
  var label = $("<div class='markerlabel'>"+markerdata.label+"</div>");
  if((markerdata.bg && markerdata.bg.substr(0,3)=="url") || markerdata.threed){
    label.appendTo(marker.find(".markerbase").css("min-height","1.1em"));
  }
  else
    label.appendTo(marker.find(".markerbody"));
  marker.resizable({autoHide: false, stop:function(){ sendmarkerupdate($(this)); },
                    resize:function(event,ui){ scaletofit($(this).find(".markerlabel")); }
                  })
        .draggable({stack:'.marker', stop:function(event,ui){ sendmarkerupdate($(this),event,ui); } })
    
  setTimeout(function(){ updatemarker(markerdata); marker.show("scale",function(){scaletofit(label);});},20);
}

function updatemarker(markerdata,marker){
  marker = marker || $("#"+markerdata.id);
  marker.data("_TT_marker",markerdata);
  marker.find(".markerlabel").text(markerdata.label);
  if(markerdata.activated === undefined)
    markerdata.activated = false;
  marker.toggleClass("activated",markerdata.activated);
  //note todo: should remove min-height from non-3d labels if null
  var update = {};
  if(markerdata.position){
    update.left = markerdata.position.left;
    update.top = markerdata.position.top;
  }
  else
    centerme(marker);
  if(markerdata.width)
    update.width = markerdata.width;
  if(markerdata.height)
    update.height = markerdata.height;
  if(!$.isEmptyObject(update) || markerdata.label){
    marker.animate(update,function(){ scaletofit(marker.find(".markerlabel")); });
  }
}

function clearMarkerActivation()
{
  $(".marker").removeClass("activated");
}

function addmarker(){
  //make sure both label and url are filled
  var bg = $("#addmarkerbg").val();
  var label=$("#addmarkerlabel").val();
  var circle = $("#addmarkercirc").is(":checked");
  var threed = $("#addmarker3d").is(":checked");
  var isimg = testimgurl(bg);
  var markerdata = {bg:wrapimgurl(bg), label:label, circle:circle, threed:threed};
  if(isimg){
    $("<img>",{
      src:bg,
      error: function(){ alert("unable to load image "+bg); },
    
      load: function(){ 
        //this is a valid image url
        socket.emit('add marker',markerdata);
      }
    });
  }
  else
    socket.emit('add marker',markerdata);
  
}

function drawpath(data){
  if(!graphicsLock){
    var ctx = $("#whiteboard").get(0).getContext('2d');
    ctx.beginPath();
    ctx.strokeStyle = data.color;
    ctx.moveTo(data.points[0][0],data.points[0][1]);
    data.points.forEach(function(point){
      ctx.lineTo(point[0],point[1]);
    });
    ctx.stroke();
  }else{
    setTimeout(function(){drawpath(data);},200);
  }
}

function sendmarkerupdate(marker,event,ui){
  var data = marker.data("_TT_marker");
  if(marker.draggable("option","helper")=="clone"){
    //actually clone instead of update
    marker.draggable("option","helper","original");
    var datacopy={};
    $.extend(datacopy,data);
    delete datacopy['id'];
    datacopy.position = ui.position;
    socket.emit('add marker',datacopy);
  }
  else{
    data.width = marker.width();
    data.height = marker.height();
    data.position = marker.position();
    data.label = marker.find(".markerlabel").text();
    //don't send the whole object...
    var reply = {
      id:data.id,
      width:data.width,
      height:data.height,
      position:data.position,
      label:data.label,
      activated:data.activated
      //add other potential updates here
    }
  
    socket.emit('update marker',reply);
  }
}

function addlayer(data, emit){
  var updateselect=false;
  if(!data){
    //generated by user form
    var input = $("#newlayername");
    if(!input.val()) return false;
    data = {layer: input.val(), visible: true};
    emit = true;
    input.val("");
    updateselect=true;
  }
  var layername = data.layer;
  if(!gamestate.layers[layername])
    gamestate.layers[layername] = {visible: data.visible, paths:[]};
  var row = $("<tr class='layercontrol'></tr>").data('layer',layername)
    .attr("id","layercontrol-"+layername)
    .append($('<td>'+layername+'</td>').click(function(){
          $("#layercontrols .layercontrol").removeClass("active");
          $(this).parent().addClass("active");
        })
        .css("cursor","pointer")
      )
    .append($('<td></td>')
        .append($("<input class='layertoggle' type='checkbox' id='showlayer-"+layername+"'>")
          .prop("checked",data.visible)
          .on('change',function(){ showlayer({layer:layername,visible:$(this).prop("checked")},true); })
        )
      )
    .append($("<td></td>")
        .append($("<button>Erase</button>").click(function(){ clearlayer({layer:layername},true); }))
      )
    .append($("<td></td>")
        .append($("<button>Delete</button>").click(function(){ deletelayer({layer:layername},true); }))
      )
    .appendTo("#layercontrols tbody");
  if(layername=="default"){
    row.find("td:last-child button").remove();
  }
  if(updateselect || !getActiveCanvasLayer())
    row.children("td:first-child").click();
  if(emit)
    socket.emit('add layer',data);
}

function deletelayer(data,emit){
  clearlayer(data,emit);
  delete gamestate.layers[data.layer];
  $("#layercontrol-"+data.layer).remove();
  $("#drawto [value='"+data.layer+"']").remove();
  if(!getActiveCanvasLayer())
  $("#layercontrol-default td:first-child").click();
  if(emit)
    socket.emit('delete layer',data);
}

function showlayer(data,emit){
  gamestate.layers[data.layer].visible = data.visible;
  $("#layercontrol-"+data.layer+" .layertoggle").prop("checked",data.visible);
  refreshwhiteboard();
  if(emit)
    socket.emit('show layer',data);
}

function removemarker(id,emit){
  $("#"+id).hide("explode",function(){ $(this).remove(); });
  if(emit)
    socket.emit('remove marker',{id:id});
}

function savegame(){
  var nameinput = $("#savename");
  var name = $.trim(nameinput.val());
  if(!name){
    alert("You must provide a name for your saved game");
    return false;
  }
  //flash the input to show that it was accepted
  var c = nameinput.css("background-color");
  nameinput.css("background-color","#00ff00");
  setTimeout(function(){ nameinput.css("background-color",c); },300);
  socket.emit('save game',{name:name,overwrite:$("#saveoverwrite").is(":checked")});
}

function loadgame(){
  console.log("getting list of save games...");
  socket.emit('list saves',0,function(err,docs){
    console.log(docs.length+" saved games retrieved");
    var tbody = $("#gameslist tbody");
    tbody.children("tr").remove();
    docs.forEach(function(doc){
      $("<tr class='savedgame'></tr>")
        .append("<td>"+doc.name+"</td>")
        .append("<td>"+(new Date(doc.time).toLocaleString())+"</td>")
        .click(function(){
          socket.emit('load game',doc);
          $("#chooseloadgame").dialog("close");
        })
        .appendTo(tbody);
    });
    $("#chooseloadgame").dialog("open");
  });
}

function activatedrawing(elem,event){
  //elem should be the whiteboard-container
  graphicsLock = true;
  $(elem).css({cursor:"crosshair"});
  var layer = getActiveCanvasLayer();
  var color = $("#drawcolor").val();
  var ctx = $("#whiteboard").get(0).getContext('2d');
  var pt = getpoint(event);
  ctx.beginPath();
  ctx.strokeStyle=color;
  ctx.moveTo(pt[0],pt[1]);
  var points = [pt];
  $(elem).on('mousemove touchmove',function(event){
    event.preventDefault();
    event.stopPropagation();
     pt = getpoint(event);
     ctx.lineTo(pt[0],pt[1]);
     ctx.stroke();
     points.push(pt);
  });
  $(elem).on('mouseup mouseleave touchend',function(event){
    event.preventDefault();
    event.stopPropagation();
    $(this).off('mousemove touchmove mouseleave mouseup touchend');
    $(this).css({cursor:"auto"});
    var path = {points:points, color:color};
    gamestate.layers[layer].paths.push(path);
    socket.emit('add path',{layer:layer, path:path});
    graphicsLock = false;
  });
}

function addTo(a, b, subtract, inplace){
  var c = inplace ? a : [];
  for(var i=0; i<a.length; ++i){
    c[i] = subtract ? a[i] - b[i] : a[i] + b[i];
  }
  return c;
}

function panlayer(layer,offset){
  var paths = gamestate.layers[layer].paths;
  paths.forEach(function(path){
    var points = path.points;
    points.forEach(function(pt){ addTo(pt,offset,0,1); });
  });
  refreshwhiteboard();
}

function animatepanlayer(layer,offset,timestamp,sofar){
  if(!timestamp){
    requestAnimationFrame(function(t){ animatepanlayer(layer,offset,t,[t,0,0]); });
  }
  else{
    var duration = 300;
    var frac = (timestamp - sofar[0])/duration;
    if(frac>1) frac=1;
    var step = addTo([offset[0]*frac,offset[1]*frac],sofar.slice(1),1);
    panlayer(layer,step);
    sofar[1] += step[0];
    sofar[2] += step[1];
    if(frac<1)
      requestAnimationFrame(function(t){ animatepanlayer(layer,offset,t,sofar.slice(0));
        });
  }
}

function zoomlayer(layer,factor,center){
  //always zoom from/to the center of the figure
  var whiteboard = $("#whiteboard").get(0);
  center = center || [whiteboard.width/2,whiteboard.height/2];
  gamestate.layers[layer].paths.forEach(function(path){
    path.points.forEach(function(pt){
      var shifted = addTo(pt,center,1);
      pt[0] = center[0] + shifted[0]*factor;
      pt[1] = center[1] + shifted[1]*factor;
    });
  });
  refreshwhiteboard();
}

function activatepanning(elem,event){
  //elem should be whiteboard-container
  $(elem).css({cursor:"move"});
  var layer = getActiveCanvasLayer();
  var startpt = getpoint(event);
  var totaloffset=[0,0];
  var lastpt = startpt;
  $(elem).on('mousemove touchmove',function(event){
    event.preventDefault();
    event.stopPropagation();
    var pt = getpoint(event);
    var offset = addTo(pt,lastpt,true);
    panlayer(layer,offset);
    lastpt = pt;
  });
  $(elem).on('mouseup mouseleave touchend',function(event){
    event.preventDefault();
    event.stopPropagation();
    $(this).off('mousemove touchmove mouseleave mouseup touchend');
    $(this).css({cursor:"auto"});
    var pt = getpoint(event);
    var offset = addTo(pt,lastpt,true);
    totaloffset = addTo(pt,startpt,true);
    panlayer(layer,offset);
    socket.emit('pan layer',{layer:layer,offset:totaloffset});
  });
}

function drawgrid(data,emit){
  console.log(data);
  data = data || {show:"none"};
  data.pitch = data.pitch || $("#gridpitch").val();
  
  if(!gamestate.grid || gamestate.grid.show != data.show || gamestate.grid.pitch != data.pitch){
    gamestate.grid = data;
    refreshwhiteboard();
  }
  if(emit)
    socket.emit("set grid",data);
  else{
    $("#gridselect input[name=showgrid][value="+data.show+"]").prop("checked",true);
    $("#gridselect").buttonset("refresh");
    $("#gridpitch").val(data.pitch);
  }
  
}

$(function(){
  //ui functionality
  $("#whiteboard").get(0).getContext('2d').lineWidth=2;
  
  $("button").button();
  $("span.buttonset").buttonset();
  //$("[type=range]").slider();
  $("#sideboard_accordion").accordion()
  
  $("#releasenotes").dialog({
    autoOpen:false,
    show:"fold",
    hide:"fade",
    draggable:false,
    resizable:false,
    width:600
  });
  
  $("#chooseloadgame").dialog({
    autoOpen: false,
    show:"fold",
    hide:"fade",
    draggable: true,
    resizable: true,
    width:600
  });
  
  $("#bgimagecrop").dialog({
    autoOpen:false,
    show: "fold",
    hide: "puff",
    draggable:false,
    resizable:false,
    width:700,
    height:500,
    open: function(){
      $("#cropselector").remove();
      $("#uncroppedbg").css("opacity",1);
      //$("#uncroppedbg").on("click",function(event){
        //$("#cropselector").remove();
        //$(this).css("opacity",1);
      //});
      $("#cropdiv").on("mousedown touchstart",function(event){
        event.preventDefault();
        event.stopPropagation();
        var img = $("#uncroppedbg");
        $("#cropselector").remove();
        img.css("opacity",0.3);
        var start = getpoint(event,true);
        var bgpos = getpoint(event);
        var selector = $("<div id='cropselector'></div>")
          .css({'background-image':wrapimgurl(img.attr("src")),
                'background-size':img.width()+"px "+img.height()+"px",
                'background-position':(-bgpos[0])+"px "+(-bgpos[1])+"px",
                'background-repeat':'no-repeat',
                'background-origin':'border-box',
                'width':1,
                'height':1
              })
          .appendTo("#cropdiv")
          .offset({left:start[0], top:start[1]});
        $("#cropdiv").on("mousemove touchmove",function(moveevent){
          var mousept = getpoint(moveevent,true);
          var newwidth = mousept[0]-start[0], newheight=mousept[1]-start[1];
          var newoffset = {left:start[0], top:start[1]};
          var newbgpos = [bgpos[0],bgpos[1]];
          if(mousept[0]<start[0]){
            newoffset.left = mousept[0];
            newbgpos[0] = getpoint(moveevent)[0];
          }
          if(mousept[1]<start[1]){
            newoffset.top = mousept[1];
            newbgpos[1] = getpoint(moveevent)[1];
          }
          selector.offset(newoffset);
          selector.css('background-position',(-newbgpos[0])+"px "+(-newbgpos[1])+"px");
          selector.width(Math.abs(newwidth)).height(Math.abs(newheight));
          //selector.width(event.offsetX-selector.offset().left).height(event.offsetY-selector.offset().top);
        });
        $("#cropdiv").on("touchend mouseup",function(endevent){
          $(this).off("mousemove touchmove touchend mouseup");
          endevent.preventDefault();
          endevent.stopPropagation();
          if(selector.width() < 10 || selector.height()<10){
            selector.remove();
            img.css("opacity",1);
          }
        });
      });
    }
  });
  $("#trashcan").droppable({accept:".marker", tolerance:"touch", 
    drop:function(event,ui){
      event.stopPropagation(); //try to prevent draggable update
      removemarker(ui.draggable.attr("id"), true);
    } 
  });
  $("#whiteboard-container").on('mousedown touchstart',function(event){
    if(!$(event.target).is("canvas")) 
      return false;
    event.preventDefault();
    event.stopPropagation();
    var touches = event.originalEvent.touches;
    if(event.which == 2 || (touches && touches.length==2) || event.ctrlKey)
      activatepanning(this,event);
    else if(event.which ==1 || (touches && touches.length==1))
      activatedrawing(this,event);
    else{
      return false;
    }
    return true;
  });
  $("#whiteboard").on("wheel",function(event){ 
    event.preventDefault();
    event.stopPropagation();
    var pos = event.originalEvent.wheelDelta ? event.originalEvent.wheelDelta>0 : event.originalEvent.deltaY<0;
    socket.emit("zoom layer",{layer:getActiveCanvasLayer(),
                              factor: pos ? 1.5 : 1/1.5,
                              center: [$("#whiteboard").get(0).width/2,$("#whiteboard").get(0).height/2]
                            }); });
  
  $("#gridselect input[name=showgrid]").change(function(){
    drawgrid({show:$(this).val(), pitch:$("#gridpitch").val()}, true);
  });
  
  $("#gridpitch").on("input",function(){
    drawgrid({show:$("#gridselect input[name=showgrid]:checked").val(),pitch:$(this).val()}, false);
  })
  .change(function(){
    drawgrid({show:$("#gridselect input[name=showgrid]:checked").val(),pitch:$(this).val()}, true);
  });
  
  socket.on('sync state',function(data){
    gamestate = data;
    //refreshwhiteboard(); <-gets called automatically
    $(".marker").remove();
    $(".layercontrol").remove();
    $.each(data.markers,function(key,val){placemarker(val);});
    $.each(data.layers,function(key,val){addlayer({layer:key,visible:val.visible}); });
    if(data.background)
      setbackground(data.background);
    drawgrid(data.grid);
  });
  
  socket.on('add marker', placemarker);
  socket.on('update marker',updatemarker);
  socket.on('remove marker',function(data){ removemarker(data.id); });
  
  socket.on('add path',function(data){ 
    gamestate.layers[data.layer].paths.push(data.path);
    drawpath(data.path);
  });
  socket.on('add layer',addlayer);
  socket.on('clear layer',clearlayer);
  socket.on('show layer',showlayer);
  socket.on('delete layer',deletelayer);
  
  socket.on('set background',setbackground);
  socket.on('clearmaskzone',function(data){
    if(!gamestate.background._clearmaskzones)
      gamestate.background._clearmaskzones = [];
    gamestate.background._clearmaskzones.push(data);
    refreshwhiteboard();
  });
  
  socket.on('pan layer',function(data){ panlayer(data.layer,data.offset); });
  socket.on('zoom layer',function(data){ zoomlayer(data.layer,data.factor,data.center); })
  socket.on('message',function(msg){ $("#messages").append("<br>"+msg); });
  socket.on('set grid',drawgrid);
  
});
