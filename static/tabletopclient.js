var socket = io();
  
function getpoint(event){
  parentpos = $(event.currentTarget).offset();
  var X = event.pageX, Y=event.pageY;
  if(X===undefined){//work with touches too
    X = event.originalEvent.touches[0].pageX;
    Y = event.originalEvent.touches[0].pageY;
  }
  return [(X-parentpos.left),(Y-parentpos.top)];
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

function setbackground(data){
  console.log("setbackground");
  console.log(data);
  if(!data){
    //this is invoked by the form
    data = {bg:wrapimgurl($("#setbackgroundbg").val())}
    socket.emit('set background',data);
  }
  $("#whiteboard-container").css({background:data.bg+" no-repeat",'background-size':'100% 100%'});
}

function clearcan(layer,emit){
  var wb = getCanvas(layer);
  var ctx = wb.getContext('2d');
  ctx.clearRect(0,0,$(wb).width(),$(wb).height());
  if(emit)
    socket.emit('clear canvas',{layer:layer});
}

function placemarker(markerdata){
  console.log("placemarker");
  console.log(markerdata);
  if(!markerdata)
    return;
  $("<div class='marker' style='display:none' id='"+markerdata.id+"'></div>")
    //.data(markerdata)
    .toggleClass("circle",markerdata.circle)
    .toggleClass("threed",markerdata.threed)
    .append($("<div class=markerbody></div>")
      .css({ background:markerdata.bg+" no-repeat center top", 'background-size':'cover'}))
    //.text(markerdata.label)
    .append("<div class='markerbase'><span>"+markerdata.label+"</span></div>")
    .appendTo("#whiteboard-container")
    .resizable({autoHide: false, stop:function(){ sendmarkerupdate($(this)); } })
    .draggable({stack:'.marker', stop:function(){ sendmarkerupdate($(this)); } })
    .on('mousedown',function(event){ event.stopPropagation(); })
    .show("scale");
  setTimeout(function(){ updatemarker(markerdata);},500);
}

function updatemarker(markerdata,marker){
  marker = marker || $("#"+markerdata.id);
  marker.data("_TT_marker",markerdata);
  var update = {};
  if(markerdata.position){
    update.left = markerdata.position.left;
    update.top = markerdata.position.top;
  }
  if(markerdata.width)
    update.width = markerdata.width;
  if(markerdata.height)
    update.height = markerdata.height;
    
  if(!$.isEmptyObject(update)){
    marker.animate({
      top:markerdata.position.top,
      left:markerdata.position.left,
      width:markerdata.width,
      height:markerdata.height
    });
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
  console.log("addmarker");
  console.log(markerdata);
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
  var ctx = getCanvas(data.layer).getContext('2d');
  ctx.beginPath();
  ctx.moveTo(data.points[0][0],data.points[0][1]);
  data.points.forEach(function(point){
    ctx.lineTo(point[0],point[1]);
  });
  ctx.stroke();
}

function sendmarkerupdate(marker){
  var data = marker.data("_TT_marker");
  data.width = marker.width();
  data.height = marker.height();
  data.position = marker.position();
  
  //don't send the whole object...
  var reply = {
    id:data.id,
    width:data.width,
    height:data.height,
    position:data.position
    //add other potential updates here
  }
  
  socket.emit('update marker',reply);
}



function removemarker(id,emit){
  $("#"+id).hide("explode",function(){ $(this).remove(); });
  if(emit)
    socket.emit('remove marker',{id:id});
}

$(function(){
  //ui functionality
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
    $(this).on('mouseup mouseout touchend',function(event){
      event.preventDefault();
      event.stopPropagation();
      $(this).off('mousemove touchmove mouseout mouseup touchend');
      $(this).css({cursor:"auto"});
      socket.emit('add path',{
        layer: layer,
        points: points
      });
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
