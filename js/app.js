$(document).ready(function() {
  var AceRange = ace.require('ace/range').Range;
  var GOINSTANT_URL = 'https://goinstant.net/stypi/markdown';
  var cursors = {};


  /*** Helpers ***/
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

  var setCursor = function(userId, position, editSession, room) {
    if (cursors[userId]) {
      editSession.removeMarker(cursors[userId]);
    }
    var range = new AceRange(position.row, position.column, position.row, position.column + 1);
    var userClass = userId.replace(/\W/g, '-');
    cursors[userId] = editSession.addMarker(range, 'cursor ' + userClass, 'text', true);
    // Assumes Ace render function will fire before .get() returns
    room.user(userId).get(function(err, user) {
      $('.cursor.' + userClass).css({
        backgroundColor: user.avatarColor,
        display: 'block',
        width: '2px'
      });
    });
  };


  /*** Initialization ***/
  var initCursorSync = function(editSession, room) {
    var cursorChannel = room.channel('cursors');
    var textChanged = false;   // Used to figure out if text change causes cursor change
    room.on('leave', function(user) {
      editSession.removeMarker(cursors[user.id]);
    });
    cursorChannel.on('message', function(position, context) {
      setCursor(context.userId, position, editSession, room);
    });
    editSession.on('change', function() {
      textChanged = true;
    });
    editSession.selection.on('changeCursor', function() {
      if (textChanged) {
        textChanged = false;
        return;
      }
      cursorChannel.message({
        row: editSession.selection.lead.row,
        column: editSession.selection.lead.column
      });
    });
  };

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

  var initRoom = function() {
    var room = window.location.hash.slice(1);
    if (!room || !room.match(/^room-/)) {
      room = 'room-';
      for(var i = 0; i < 6; i += 1) {
        room += Math.floor(Math.random() * 36).toString(36);
      }
      window.location.hash = room;
    }
    $(window).on('hashchange', function() {
      document.location.reload();
    });
    return room;
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

  var initUserList = function(room) {
    var userColors = new goinstant.widgets.UserColors({ room: room });
    var userList = new goinstant.widgets.UserList({
      collapsed: true,
      position: 'right',
      room: room
    });

    userColors.choose(function(err, color) {
      if (err) console.error('User color selection error', err);
    });
    userList.initialize(function(err) {
      if (err) console.error('User list initialization error', err);
    });
  };


  /*** Main ***/
  var room = initRoom();

  goinstant.connect(GOINSTANT_URL, { room: room }, function(err, conn, room) {
    if (err) return console.error(err);

    var editSession = initEditor();
    initMarkdown(editSession);
    initTextSync(room, editSession);
    initUserList(room);
    initCursorSync(editSession, room);
  });
});
