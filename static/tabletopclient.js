var socket = io();
var graphicsLock=false;

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
    return [X,Y];
  return [(X-parentpos.left),(Y-parentpos.top)];
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
  return $("#drawto").val();
}

function getCanvas(layer){
  return $("#whiteboard-container canvas").get(layer);
}

function testimgurl(s){
  return (s.substr(0,5) == "data:" || s.indexOf('.')>-1)
}

function wrapimgurl(s){
  if(testimgurl(s))
    return "url('"+s+"')";
  return s;
}

function setbackgroundcropping(){
  //see if it's cropped at all
  var selector = $("#cropselector");
  var img = $("#uncroppedbg");
  var data = {background:wrapimgurl(img.attr("src"))+" no-repeat"};
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
  $("#whiteboard-container").css(data);
  if(emit)
    socket.emit('set background',data);
}

function clearcan(layer,emit){
  var wb = getCanvas(layer);
  var ctx = wb.getContext('2d');
  ctx.clearRect(0,0,$(wb).width(),$(wb).height());
  if(emit)
    socket.emit('clear canvas',{layer:layer});
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
     ;
  var label = $("<div class='markerlabel'>"+markerdata.label+"</div>");
  if(markerdata.bg.substr(0,3)=="url" || markerdata.threed){
    label.appendTo(marker.find(".markerbase").css("min-height","1.1em"));
  }
  else
    label.appendTo(marker.find(".markerbody"));
  marker.resizable({autoHide: false, stop:function(){ sendmarkerupdate($(this)); },
                    resize:function(event,ui){ scaletofit($(this).find(".markerlabel")); }
                  })
        .draggable({stack:'.marker', stop:function(event,ui){ sendmarkerupdate($(this),event,ui); } })
    
  setTimeout(function(){ updatemarker(markerdata); marker.show("scale",function(){scaletofit(label);});},200);
}

function updatemarker(markerdata,marker){
  marker = marker || $("#"+markerdata.id);
  marker.data("_TT_marker",markerdata);
  marker.find(".markerlabel").text(markerdata.label);
  //note todo: should remove min-height from non-3d labels if null
  var update = {};
  if(markerdata.position){
    update.left = markerdata.position.left;
    update.top = markerdata.position.top;
  }
  if(markerdata.width)
    update.width = markerdata.width;
  if(markerdata.height)
    update.height = markerdata.height;
  if(!$.isEmptyObject(update) || markerdata.label){
    marker.animate(update,function(){ scaletofit(marker.find(".markerlabel")); });
  }
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

function addpath(data){
  if(!graphicsLock){
    var ctx = getCanvas(data.layer).getContext('2d');
    ctx.beginPath();
    ctx.moveTo(data.points[0][0],data.points[0][1]);
    data.points.forEach(function(point){
      ctx.lineTo(point[0],point[1]);
    });
    ctx.stroke();
  }else{
    setTimeout(function(){addpath(data);},200);
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
      label:data.label
      //add other potential updates here
    }
  
    socket.emit('update marker',reply);
  }
}



function removemarker(id,emit){
  $("#"+id).hide("explode",function(){ $(this).remove(); });
  if(emit)
    socket.emit('remove marker',{id:id});
}

$(function(){
  //ui functionality
  $("#releasenotes").dialog({
    autoOpen:false,
    show:"fold",
    hide:"fade",
    draggable:false,
    resizable:false,
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
  $("#whiteboard").get(0).getContext('2d').strokeStyle='red';
  $("#whiteboard").get(0).getContext('2d').lineWidth=2;
  $("#whiteboard_bg").get(0).getContext('2d').strokeStyle='black';
  $("#whiteboard_bg").get(0).getContext('2d').lineWidth=2;
  $("#trashcan").droppable({accept:".marker", tolerance:"touch", 
    drop:function(event,ui){
      event.stopPropagation(); //try to prevent draggable update
      removemarker(ui.draggable.attr("id"), true);
    } 
  });
  $("#whiteboard-container").on('mousedown touchstart',function(event){
    if($(event.target).hasClass("marker") || 
       $(event.target).hasClass("markerbody") || 
       $(event.target).hasClass("markerbase") )
      return;
    graphicsLock = true;
    event.preventDefault();
    event.stopPropagation();
    $(this).css({cursor:"crosshair"});
    var layer = getActiveCanvasLayer();
    var canvas = getCanvas(layer);
    var ctx = canvas.getContext('2d');
    var pt = getpoint(event);
    ctx.beginPath();
    ctx.moveTo(pt[0],pt[1]);
    var points = [pt];
    $(this).on('mousemove touchmove',function(event){
      event.preventDefault();
      event.stopPropagation();
       pt = getpoint(event);
       ctx.lineTo(pt[0],pt[1]);
       ctx.stroke();
       points.push(pt);
    });
    $(this).on('mouseup mouseleave touchend',function(event){
      event.preventDefault();
      event.stopPropagation();
      $(this).off('mousemove touchmove mouseleave mouseup touchend');
      $(this).css({cursor:"auto"});
      socket.emit('add path',{
        layer: layer,
        points: points
      });
      graphicsLock = false;
    });
  });
  
  
  socket.on('sync state',function(data){
    //clear everything first
    //should do this more automatically
    clearcan(0);
    clearcan(1);
    $(".marker").remove();
    data.markers.forEach(placemarker);
    data.paths.forEach(addpath);
    if(data.background)
      setbackground(data.background);
  });
  
  socket.on('add marker', placemarker);
  socket.on('update marker',updatemarker);
  socket.on('remove marker',function(data){ removemarker(data.id); });
  
  socket.on('add path',addpath);
  socket.on('clear canvas',function(data){ clearcan(data.layer); });
  
  socket.on('set background',setbackground);
  
  socket.on('message',function(msg){ $("#messages").append("<br>"+msg); });
  
});
