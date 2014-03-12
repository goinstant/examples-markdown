$(document).ready(function() {
  var AceRange = require('ace/range').Range;
  var GOINSTANT_URL = 'https://local.goinstant.org/goinstant-test/default';

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
    var text = room.text('text');
    var ignoreChanges = false;

    editSession.on('change', function(change) {
      if (ignoreChanges) return;
      console.log('ace change', change);
      if (change.data.action == 'insertText') {
        var index = positionToIndex(editSession, change.data.range.start);
        console.log('sending insert', index, change.data.text);
        text.insert({
          index: index,
          text: change.data.text
        });
      } else if (change.data.action == 'removeText') {
        var startIndex = positionToIndex(editSession, change.data.range.start);
        var endIndex = positionToIndex(editSession, change.data.range.end);
        console.log('sending delete', startIndex, endIndex - startIndex);
        text.delete({
          index: startIndex,
          length: endIndex - startIndex
        });
      }
    });

    text.on('insert', function(operation) {
      console.log('got insert', operation);
      var position = indexToPosition(editSession, operation.index);
      ignoreChanges = true;
      editSession.insert(position, operation.text);
      ignoreChanges = false;
    });

    text.on('delete', function(operation) {
      console.log('got delete', operation);
      var startPosition = indexToPosition(editSession, operation.index);
      var endPosition = indexToPosition(editSession, operation.index + operation.length);
      var range = new AceRange(startPosition.row, startPosition.column, endPosition.row, endPosition.column);
      ignoreChanges = true;
      editSession.remove(range);
      ignoreChanges = false;
    });
  };

  var indexToPosition = function(editSession, index) {
    var lines = editSession.getValue().split('\n');
    for (var row in lines) {
      if (index <= lines[row].length) {
        return { row: row, column: index };
      } else {
        index -= (lines[row].length + 1);   // +1 for newline
      }
    }
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
    console.log('connected!')
    if (err) return console.error(err);

    var editSession = initEditor();
    initMarkdown(editSession);
    initTextSync(room, editSession);
  });
});
