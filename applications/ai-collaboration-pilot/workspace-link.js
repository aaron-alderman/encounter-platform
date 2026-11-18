(() => {
  if (window.location.pathname !== '/workspace/home') return;
  const apps = document.querySelector('#workspace .program-group[data-group="hosted"]');
  const list = apps?.querySelector('ul');
  if (!list || document.getElementById('ai-collaboration-app')) return;

  const link = document.createElement('a');
  link.className = 'app-link';
  link.href = '/ai-collaboration/';
  const label = document.createElement('span');
  label.className = 'app-label';
  const name = document.createElement('strong');
  name.textContent = 'Working together with AI';
  const summary = document.createElement('small');
  summary.className = 'app-card-summary';
  summary.textContent = 'Share contributions and draft a synthesis together.';
  label.append(name, summary);
  link.append(label);

  const item = document.createElement('li');
  item.id = 'ai-collaboration-app';
  item.append(link);
  list.append(item);
  const count = apps.querySelector('h2 > span');
  if (count) count.textContent = String(list.children.length);
})();
