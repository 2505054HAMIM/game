# Steel Vanguard

Three.js দিয়ে বানানো browser এর 3D mech battle গেম। VX-7 Vanguard চালিয়ে Crimson Legion এর villain mech দের wave এর পর wave ধ্বংস করতে হবে। প্রতি ৫ নম্বর wave এ Boss **Overlord** আসে।

## চালানোর নিয়ম

লাগবে: [Node.js](https://nodejs.org) (LTS version)

```bash
npm install
npm run dev      # http://localhost:5173 এ গেম খুলবে
npm run build    # dist/ folder এ build হবে (dist/artifact.html = এক ফাইলের ভার্সন)
```

## কন্ট্রোল

| Key | কাজ |
|---|---|
| W A S D | হাঁটা |
| Mouse | নিশানা করা |
| Space | লাফ, ধরে রাখলে hover |
| Shift | Quick boost (দ্রুত সরে যাওয়া) |
| বাম ক্লিক | Pulse rifle |
| ডান ক্লিক | ধরে রাখলে missile lock, ছেড়ে দিলে fire |
| F | Arc blade slash (কাছের শত্রুর দিকে ঝাঁপিয়ে পড়ে) |
| R | Reload |
| Esc | Pause |

## Villain

| নাম | বৈশিষ্ট্য |
|---|---|
| Raider | দ্রুত, লাফায়, পরপর লাল গুলি করে |
| Juggernaut | ভারী armor, কাঁধের কামান থেকে mortar ছোড়ে |
| Wraith | বাতাসে ভাসে, homing missile মারে |
| Overlord (Boss) | Gatling, fan shot, missile salvo আর লাফিয়ে মাটিতে আছাড়। আছাড়ের সময় লাফ দিলে বাঁচা যায়। HP অর্ধেক হলে আরও রেগে যায়। |

## 3D model বদলানোর নিয়ম

এখন সব mech কোড দিয়ে বানানো (`src/mech/MechModel.js`), তাই কোনো model ফাইল লাগে না। Meshy, Higgsfield বা Blender দিয়ে বানানো আসল model বসাতে চাইলে:

1. Model টা **`.glb`** format এ export করুন।
2. ফাইলটা `public/models/` folder এ রাখুন, যেমন `public/models/raider.glb`।
3. `src/mech/designs.js` খুলে ওই mech এর `glb: null` বদলে লিখুন `glb: 'models/raider.glb'`।

Model এর size আপনাআপনি mech এর উচ্চতা অনুযায়ী ঠিক হয়ে যাবে। `.glb` ফাইলে Walk বা Idle animation থাকলে সেটাও চলবে। ফাইল load না হলে আগের কোডে বানানো mech টাই দেখাবে।

## ফোল্ডার

```
src/
  main.js            শুরু, মেনু, pause
  engine/            renderer (bloom, shadow), input, sound, texture
  world/Arena.js     মাঠ, আকাশ, cover block, energy wall
  mech/              mech এর ডিজাইন, 3D মডেল, চলাফেরা আর animation
  game/              Player, Enemy (AI), Combat (গুলি/missile), Effects, Game loop
  ui/HUD.js          AP/EN bar, radar, target marker
```
