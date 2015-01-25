var socket = io();
  
function getpoint(event){
  parentpos = $(event.target).offset();
  return [(event.pageX-parentpos.left),(event.pageY-parentpos.top)];
}

function getActiveCanvasLayer(){
  return $("#drawto").val();
}

function getCanvas(layer){
  return $("#whiteboard-container canvas").get(layer);
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
  $("<div class='marker' style='display:none' id='"+markerdata.id+"'></div>")
    //.data(markerdata)
    
    .append($("<div class=markerbody></div>")
      .css({ background:markerdata.bg+" no-repeat center top", 'background-size':'cover'}))
    //.text(markerdata.label)
    .append("<div class='markerbase'>"+markerdata.label+"</div>")
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
  var isimg = (bg.substr(0,5) == "data:" || bg.indexOf('.')>-1);
  var markerdata = {bg:bg, label:label};
  if(isimg){
    markerdata.bg = "url('"+bg+"')";
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
  $("#whiteboard_bg").get(0).getContext('2d').strokeStyle='black';
  $("#trashcan").droppable({accept:".marker", tolerance:"touch", 
    drop:function(event,ui){
      event.stopPropagation(); //try to prevent draggable update
      removemarker(ui.draggable.attr("id"), true);
    } 
  });
  $("#whiteboard-container").on('mousedown',function(event){ 
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
    $(this).on('mousemove',function(event){
       pt = getpoint(event);
       ctx.lineTo(pt[0],pt[1]);
       ctx.stroke();
       points.push(pt);
    });
    $(this).on('mouseup',function(event){
      $(this).off('mouseup');
      $(this).off('mousemove');
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
  });
  
  socket.on('add marker', placemarker);
  socket.on('update marker',updatemarker);
  
  socket.on('remove marker',function(data){ removemarker(data.id); });
  
  socket.on('add path',addpath);
  
  socket.on('clear canvas',function(data){ clearcan(data.layer); });
  
  socket.on('message',function(msg){ $("#messages").append("<br>"+msg); });
  
});
