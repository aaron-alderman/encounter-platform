(() => {
  if (window.location.pathname !== '/workspace/home') return;
  const apps = document.querySelector('#workspace .program-group[data-group="hosted"]');
  const list = apps?.querySelector('ul');
  if (!list) return;

  function add(id, href, title, detail) {
    if (document.getElementById(id)) return;
    const link = document.createElement('a');
    link.className = 'app-link';
    link.href = href;
    const label = document.createElement('span');
    label.className = 'app-label';
    const name = document.createElement('strong');
    name.textContent = title;
    const summary = document.createElement('small');
    summary.className = 'app-card-summary';
    summary.textContent = detail;
    label.append(name, summary);
    link.append(label);

    const item = document.createElement('li');
    item.id = id;
    item.append(link);
    list.append(item);
  }

  add('ai-collaboration-app', '/ai-collaboration/', 'Working together with AI', 'Share contributions and draft a synthesis together.');
  if (/* USEWORDS_ENABLED */ false) {
    add('usewords-app', '/usewords/', 'Usewords', 'Work on a shared matter, review proposals, and ask AI for suggestions.');
  }
  const count = apps.querySelector('h2 > span');
  if (count) count.textContent = String(list.children.length);
})();
