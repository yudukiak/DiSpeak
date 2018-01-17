exports.sendBouyomi = function(options, message) {
  var messageBuffer = new Buffer(message);

  var buffer = new Buffer(15 + messageBuffer.length);
    buffer.writeUInt16LE(0x0001, 0);
    buffer.writeUInt16LE(0xFFFF, 2);
    buffer.writeUInt16LE(0xFFFF, 4);
    buffer.writeUInt16LE(0xFFFF, 6);
    buffer.writeUInt16LE(0000, 8);
    buffer.writeUInt8(00, 10);
    buffer.writeUInt32LE(messageBuffer.length, 11);
    messageBuffer.copy(buffer, 15, 0, messageBuffer.length);

  require('net').connect(options).end(buffer);
}
