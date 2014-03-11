$(document).ready(function() {
  var editor = ace.edit('ace-container');
  editor.setTheme("ace/theme/monokai");
  var session = editor.getSession()
  session.setMode('ace/mode/markdown');

  $markdownContainer = $('#markdown-container');

  session.on('change', function() {
    var html = markdown.toHTML(session.getValue());
    $markdownContainer.html(html);
  });
});
