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
  /* group order = order listed in `groups`; featured:true makes a wide highlight card */
  groups: ["Featured", "Retro & Embedded", "Legacy (Tesla & older)"],
  projects: [
    {group:"Featured", featured:true, name:"CoCoCas2Wav", desc:"Hand-written converter that turns .cas cassette files (and .dsk via dsk2cas) into .wav audio you can play straight into a real TRS-80 Color Computer. Includes ESP32 CoCo firmware.", tags:["JavaScript","Web","CoCo"], status:"live", url:"https://gigajunky.github.io/coco/index.html", repo:"https://github.com/GigaJunky/coco"},
    {group:"Featured", hl:true, name:"MicroJS", desc:"A JavaScript interpreter written from scratch for ESP32 display boards (CYD, Cardputer, ESP32-CoCo, RP2350). Type JS into a REPL and see it on screen right away.", tags:["C++","Embedded"], status:"active", url:"https://github.com/GigaJunky/microjs"},
    {group:"Featured", hl:true, name:"AI Games", desc:"Games I had AI build: Georoids, Neon Centipede, Invaders Extreme, Dungeons of Daggorath, Skyfall 2049 and more. Playable in the browser.", tags:["JavaScript","Web"], status:"live", url:"https://gigajunky.github.io/ai/index.html"},
    {group:"Retro & Embedded", name:"RomCheckJS", desc:"Check ROM sets against MAME-style XML data in the browser.", tags:["JavaScript","Web"], status:"live", url:"https://gigajunky.github.io/romcheckjs/web/index.html", repo:"https://github.com/GigaJunky/romcheckjs"},
    {group:"Legacy (Tesla & older)", name:"TeslaCam Player", desc:"Plays TeslaCam left / center / right videos in sync. Probably outdated.", tags:["JavaScript","Tesla"], status:"archived", url:"https://gigajunky.github.io/teslacamplayer/", repo:"https://github.com/GigaJunky/TeslaCamPlayer"},
    {group:"Legacy (Tesla & older)", name:"Tesla LightShow Player", desc:"Single-page player for Tesla lightshow .fseq files.", tags:["HTML","Tesla"], status:"archived", url:"https://gigajunky.github.io/TeslaLightShowPlayer.html", repo:"https://github.com/GigaJunky/TeslaLightShowPlayer"},
    {group:"Legacy (Tesla & older)", name:"Tesla Solar Chart", desc:"Solar energy monitor charts, plus the NodeJS proxy that caches the data.", tags:["JavaScript","Tesla"], status:"archived", url:"https://gigajunky.github.io/SolarChart/SolarChart.html", repo:"https://github.com/GigaJunky/TeslaSolarChart"}
  ],
  updates: [
    {date:"2026-10-06", title:"Site Updated", text:"BitJunky's is online. Projects and news will land here."},
  ],
  messages: [
    {from:"BitJunky", text:"Welcome! Drop a message below or open an issue on any project."}
  ]
};
/* ======================================================= */
