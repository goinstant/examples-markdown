$(document).ready(function() {
  var AceRange = ace.require('ace/range').Range;
  var GOINSTANT_URL = 'https://goinstant.net/stypi/markdown';
  var INITIAL_TEXT = [
    '# Three Laws\n\n',
    'These laws form an organizing principle and unifying theme for robot behavior.\n\n',
    '1. A robot may not **injure** a _human being_ or, through inaction, allow a _human being_ to come to harm.\n',
    '2. A robot must **obey** the orders given to it by _human beings_, except where such orders would conflict with the [First Law][1].\n',
    '3. A robot must **protect** its own existence as long as such protection does not conflict with the [First][1] or [Second Law][2].\n\n',
    '[1]: http://en.wikipedia.org/wiki/Isaac_Asimov\n',
    '[2]: http://en.wikipedia.org/wiki/Three_Laws_of_Robotics\n'
  ].join('')
  var cursors = {};


  /*** Helpers ***/
  var extractAceText = function(change) {
    if (change.text) {
      return change.text;
    } else if (change.lines) {
      return change.lines.join('\n') + '\n';
    } else {
      return '';
    }
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

  var setCursor = function(room, editSession, userId, position) {
    var userClass = userId.replace(/\W/g, '-');
    if (cursors[userId]) {
      editSession.removeMarker(cursors[userId].markerId);
    } else {
      room.user(userId).get(function(err, user) {
        var rule = '#ace-container .cursor.' + userClass + ' { background-color: ' + user.avatarColor + '; }';
        $('<style type="text/css">' + rule + '</style>').appendTo('head');
      });
    }
    var range = new AceRange(position.row, position.column, position.row, position.column + 1);
    var markerId = editSession.addMarker(range, 'cursor ' + userClass, 'text', true);
    cursors[userId] = {
      index: positionToIndex(editSession, position),
      markerId: markerId
    };
  };

  var updateCursors = function(room, editSession, userId, index, length) {
    var position = indexToPosition(editSession, index + Math.max(0, length));
    // Set author cursor
    if (userId) {
      setCursor(room, editSession, userId, position);
    }
    // Shift everyone else's cursor
    for (var id in cursors) {
      var cursor = cursors[id];
      if (id === userId || !cursor || cursor.index <= index) {
        continue;
      }
      var newIndex = cursor.index + Math.max(length, index - cursor.index);
      setCursor(room, editSession, id, indexToPosition(editSession, newIndex));
    }
  };


  /*** Initialization ***/
  var initCursorSync = function(room, editSession) {
    var cursorChannel = room.channel('cursors');
    var textChanged = false;   // Used to figure out if text change causes cursor change
    room.on('leave', function(user) {
      if (cursors[user.id]) {
        editSession.removeMarker(cursors[user.id].markerId);
        delete cursors[user.id];
      }
    });
    cursorChannel.on('message', function(position, context) {
      setCursor(room, editSession, context.userId, position);
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
    editor.commands.removeCommand('gotoline');
    editor.setTheme('ace/theme/monokai');
    editor.setShowPrintMargin(false);
    var session = editor.getSession();
    session.setMode('ace/mode/markdown');
    session.setUseSoftTabs(true);
    session.setUseWrapMode(true);
    session.doc.setNewLineMode('unix');
    return editor;
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
    var onLocalChange = false;
    var ot = room.text('text');

    ot.get(function(err, delta, context) {
      console.info('Got version', context.version);

      editSession.on('change', function(change) {
        if (onLocalChange) return;
        var index = positionToIndex(editSession, change.data.range.start);
        var text = extractAceText(change.data);
        if (change.data.action === 'insertText' || change.data.action === 'insertLines') {
          var operation = { index: index, text: text };
          console.info('Sending insert', operation);
          ot.insert(operation, function(err) {
            if (err) console.error('Insert error', err);
          });
          updateCursors(room, editSession, false, index, text.length);
        } else if (change.data.action === 'removeText' || change.data.action === 'removeLines') {
          var operation = { index: index, length: text.length };
          console.info('Sending delete', operation);
          ot.delete(operation, function(err) {
            if (err) console.error('Delete error', err);
          });
          updateCursors(room, editSession, false, index, -1 * text.length);
        }
      });

      ot.on('insert', function(operation, context) {
        console.info('Got insert', operation);
        var position = indexToPosition(editSession, operation.index);
        onLocalChange = true;
        editSession.insert(position, operation.text);
        updateCursors(room, editSession, context.userId, operation.index, operation.text.length);
        onLocalChange = false;
      });

      ot.on('delete', function(operation, context) {
        console.info('Got delete', operation);
        var startPosition = indexToPosition(editSession, operation.index);
        var endPosition = indexToPosition(editSession, operation.index + operation.length);
        var range = new AceRange(startPosition.row, startPosition.column, endPosition.row, endPosition.column);
        onLocalChange = true;
        editSession.remove(range);
        updateCursors(room, editSession, context.userId, operation.index, -1 * operation.length);
        onLocalChange = false;
      });

      if (context.version === 0) {
        editSession.setValue(INITIAL_TEXT);
      }
    });
  };

  var initUserList = function(room) {
    var userColors = new goinstant.widgets.UserColors({ room: room });
    var userContainer = document.getElementById("user-list");
    var userList = new goinstant.widgets.UserList({
      collapsed: false,
      container: userContainer,
      truncateLength: 10000,
      room: room
    });

    userColors.choose(function(err, color) {
      if (err) console.error('User color selection error', err);
    });
    userList.initialize(function(err) {
      if (err) console.error('User list initialization error', err);
    });
  };

  var addShareButton = function(text) {
    var shareBtn = document.createElement('div');
    $(shareBtn).addClass('share-btn');

    shareBtn.innerHTML = '<input id="gi-share-text" type="text" value="' + text + '"/>';

    var shareBtnWrap = $('.invite-a-friend')[0];
    $(shareBtnWrap).append(shareBtn);
  };

  /*** Main ***/
  var room = initRoom();
  var editor = initEditor();
  var editSession = editor.getSession();
  initMarkdown(editSession);
  addShareButton(document.URL);

  goinstant.connect(GOINSTANT_URL, { room: room }, function(err, conn, room) {
    if (err) return console.error(err);

    initTextSync(room, editSession);
    initUserList(room);
    initCursorSync(room, editSession);
  });

  $('#full-screen-editor').on('click', function() {
    $(this).toggleClass('full-screen');
    $('.editor').toggleClass('full-screen');

    //Timeout to offset CSS transition
    setTimeout(editor.resize.bind(), 300);
  });
});
