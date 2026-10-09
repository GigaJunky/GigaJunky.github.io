/* ===== BITJUNKY'S SETTINGS (edit this file only) =====
   GUESTBOOK SETUP (one time, ~3 minutes):
   1. In your site repo: Settings > General > Features > tick "Discussions".
   2. In Discussions, create a category named "Guestbook" (format: Announcement,
      so only you can start threads, and visitors comment under them).
   3. Install the giscus app on that repo: https://github.com/apps/giscus
   4. Go to https://giscus.app, enter your repo, pick the "Guestbook" category,
      and copy the data-repo-id and data-category-id values it shows you.
   5. Paste them below. Make sure the repo is public.
   6. Create one Discussion titled exactly "Guestbook" in that category
      (giscus will also create it automatically on the first comment).
*/
const CONFIG = {
  giscus: {
    repo: "GigaJunky/GigaJunky.github.io",
    repoId: "MDEwOlJlcG9zaXRvcnkxNzY0MTY4MDU=", // e.g. "R_kgDOAbCdEf"
    category: "Announcements",
    categoryId: "DIC_kwDOCoPoJc4DHOAe"          // e.g. "DIC_kwDOAbCdEf4Cxyz1"
  },
  github: "GigaJunky",          // your GitHub username
  email:  "BitJunky@hotmail.com",        // where the message form sends mail
  tagline: "Tinkering with bits, bytes and blinking lights. Here's what I'm building.",
  projects: [
    {name:"COCOCAS2WAV",   desc:"Converts .cas (Cassette) data files to .wav to play into a real Color Computer.", tags:["JavaScript","Web"],  status:"live",   url:"https://gigajunky.github.io/coco/index.html"},
    {name:"AI Games",   desc:"Some Games I had AI make.", tags:["JavaScript","Web"],  status:"live",   url:"https://gigajunky.github.io/index2.html"},
    {name:"Project Three", desc:"A work in progress that's not ready for the world yet.", tags:["Rust","Embedded"],   status:"in progress", url:"https://github.com/your-username/project-three"}
  ],
  updates: [
    {date:"2026-10-06", title:"Site Updated", text:"BitJunky's is online. Projects and news will land here."},
    {date:"2026-10-01", title:"Project Three started", text:"Sketched the first prototype this weekend."}
  ],
  messages: [
    {from:"BitJunky", text:"Welcome! Drop a message below or open an issue on any project."}
  ]
};
/* ======================================================= */
