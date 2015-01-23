var socket = io();
  
function getpoint(event){
  parentpos = $(event.target).offset();
  return [(event.clientX-parentpos.left),(event.clientY-parentpos.top)];
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
  $("<div class='marker' style='display:none' id='"+markerdata.id+"'></div>")
    .append("<img src='"+markerdata.url+"'/>")
    .append("<div class='markerbase'>"+markerdata.label+"</div>")
    .appendTo("#whiteboard-container")
    .resizable({aspectRatio:true, stop:function(){ sendmarkerupdate($(this)); } })
    .draggable({stack:'.marker', stop:function(){ sendmarkerupdate($(this)); } })
    .on('mousedown',function(event){ event.stopPropagation(); })
    .show("scale");
}

function addmarker(){
  //make sure both label and url are filled
  var url  =$("#addmarkerurl").val();
  var label=$("#addmarkerlabel").val();
  $("<img>",{
    src:url,
    error: function(){ alert("unable to load image at "+url); },
    load: function(){ 
      var markerdata = { url:url, label:label};
      socket.emit('add marker',markerdata);
      //need to receive id from server!
      //placemarker(markerdata);
    }
  });
}

function sendmarkerupdate(marker){
  var data = {
    id: marker.attr("id"),
    width: marker.width(),
    position: marker.position()
  };
  socket.emit('update marker',data);
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
  $("#trashcan").droppable({accept:".marker", drop:function(event,ui){
      removemarker(ui.draggable.attr("id"), true);
    } 
  });
  $("#whiteboard-container").on('mousedown',function(event){ 
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
  
  
  
  
  socket.on('add marker', placemarker);
  socket.on('update marker',function(data){
    $("#"+data.id).animate({
        top:data.position.top,
        left:data.position.left,
        width:data.width
      });
  });
  socket.on('remove marker',function(data){ removemarker(data.id); });
  
  socket.on('add path',function(data){
    var ctx = getCanvas(data.layer).getContext('2d');
    ctx.beginPath();
    ctx.moveTo(data.points[0][0],data.points[0][1]);
    data.points.forEach(function(point){
      ctx.lineTo(point[0],point[1]);
    });
  });
  
  socket.on('clear canvas',function(data){ clearcan(data.layer); });
  
});
