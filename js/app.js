$(document).ready(function() {
  var AceRange = require('ace/range').Range;
  var GOINSTANT_URL = 'https://goinstant.net/stypi/markdown';

  var initEditor = function() {
    var editor = ace.edit('ace-container');
    editor.setTheme('ace/theme/monokai');
    var session = editor.getSession();
    session.setMode('ace/mode/markdown');
    session.setUseSoftTabs(true);
    session.doc.setNewLineMode('unix');
    return session;
  };

  var initMarkdown = function(editSession) {
    var $markdownContainer = $('#markdown-container');
    editSession.on('change', function() {
      var html = markdown.toHTML(editSession.getValue());
      $markdownContainer.html(html);
    });
  };

  var initTextSync = function(room, editSession) {
    var ot = room.text('text');
    var onLocalChange = false;

    editSession.on('change', function(change) {
      if (onLocalChange) return;
      change = change.data;
      if (change.action=== 'insertText' || change.action === 'insertLines') {
        var index = positionToIndex(editSession, change.range.start);
        var text = change.action === 'insertText' ? change.text : change.lines.join('\n') + '\n';
        var operation = {
          index: index,
          text: text
        };
        console.info('Sending insert', operation);
        ot.insert(operation, function(err) {
          if (err) console.error('Insert error', err);
        });
      } else if (change.action === 'removeText' || change.action === 'removeLines') {
        var index = positionToIndex(editSession, change.range.start);
        var text = change.action === 'removeText' ? change.text : change.lines.join('\n') + '\n';
        var operation = {
          index: index,
          length: text.length
        };
        console.info('Sending delete', operation);
        ot.delete(operation, function(err) {
          if (err) console.error('Delete error', err);
        });
      }
    });

    ot.on('insert', function(operation) {
      console.info('Received insert', operation);
      var position = indexToPosition(editSession, operation.index);
      onLocalChange = true;
      editSession.insert(position, operation.text);
      onLocalChange = false;
    });

    ot.on('delete', function(operation) {
      console.info('Received delete', operation);
      var startPosition = indexToPosition(editSession, operation.index);
      var endPosition = indexToPosition(editSession, operation.index + operation.length);
      var range = new AceRange(startPosition.row, startPosition.column, endPosition.row, endPosition.column);
      onLocalChange = true;
      editSession.remove(range);
      onLocalChange = false;
    });
  };

  var indexToPosition = function(editSession, index) {
    var lines = editSession.getValue().split('\n');
    var row;
    for (row = 0; row < lines.length; row += 1) {
      if (index <= lines[row].length) {
        break;
      } else {
        index -= (lines[row].length + 1);   // +1 for newline
      }
    }
    return { row: row, column: index };
  };

  var positionToIndex = function(editSession, position) {
    var lines = editSession.getValue().split('\n');
    var index = 0;
    for (var i = 0; i < position.row; i += 1) {
      index += lines[i].length + 1;  // +1 for newline
    }
    return index + position.column;
  };

  var room = 'global';
  goinstant.connect(GOINSTANT_URL, { room: room }, function(err, conn, room) {
    if (err) return console.error(err);

    var editSession = initEditor();
    initMarkdown(editSession);
    initTextSync(room, editSession);
  });
});
