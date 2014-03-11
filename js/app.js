$(document).ready(function() {
  var editor = ace.edit('ace-container');
  editor.setTheme("ace/theme/monokai");
  editor.getSession().setMode('ace/mode/markdown');
});
