$(function(){
  var socket = io();
  $("#helloworld").click(function(){ 
    console.log("Sending hello world event...");
    socket.emit('hello world'); 
  });
  
  socket.on('hello yourself',function(data){
    console.log("received hello yourself event");
    $("#messages").append("<p>Hello yourself! "+data.text+"</p>");
  });
  
  socket.on('move marker',function(data){
    $("#board .marker").animate({
        top:data.position.top,
        left:data.position.left
      });
  });
  
  $("#board .marker").draggable({
      stack:".marker",
      stop: function(event,ui){
        socket.emit('move marker',{
          position: ui.position
        });
        console.log("marker dragged to"+ui.position.top+","+ui.position.left);
      }
  });
});
