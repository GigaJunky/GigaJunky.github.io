/* ===== BITJUNKY'S LINKS (edit this file only) =====
   Add groups and links below. icon is optional (any emoji). */
const LINKS = [
  { group: "My Stuff", items: [
    { title: "GitHub",        url: "https://github.com/your-username",          desc: "All my repos and experiments.", icon: "🐙" },
    { title: "Project One",   url: "https://github.com/your-username/project-one", desc: "Short note about this project.", icon: "🕹️" }
  ]},
  { group: "Favorites", items: [
    { title: "Hackaday",      url: "https://hackaday.com",                      desc: "Hacks, builds and tinkering.", icon: "🔧" },
    { title: "Hacker News",   url: "https://news.ycombinator.com",              desc: "Tech news and discussion.",    icon: "📰" }
  ]},
  { group: "Tools", items: [
    { title: "MDN Web Docs",  url: "https://developer.mozilla.org",             desc: "Web development reference.",   icon: "📚" }
  ]}
];

/* ===== OPTIONAL: auto-scan settings =====
   links.html scans your repo for .html pages and lists them under "Pages".
   It works with no settings. Uncomment to customize.
   Tip: in any page's <head>, add <meta name="description" content="..."> for the
   description, <meta name="icon" content="🎮"> for the icon, or
   <meta name="links" content="hide"> to keep that page off the list. */
/*
const AUTO_LINKS = {
  enabled: true,
  group: "Pages",                                  // heading for scanned pages
  repo: "",                                        // "owner/repo" (blank = detect from the site URL)
  exclude: ["index.html","links.html","404.html"]  // root-level files to skip
};
*/
