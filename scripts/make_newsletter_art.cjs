// Draws the newsletter's pictures (masthead, section banners, footer) in the site's 3rd Man font with the red matrix rain.
// Run once: node scripts/make_newsletter_art.js   (needs playwright). Output: img/newsletter/*.png
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const root = path.join(__dirname, '..'), out = path.join(root, 'img', 'newsletter'); fs.mkdirSync(out, { recursive: true });
const font = 'data:font/woff;base64,' + fs.readFileSync(path.join(root, 'fonts', '3rd-Man.woff')).toString('base64');
const css = `@font-face{font-family:'M';src:url('${font}')}
*{margin:0;box-sizing:border-box} body{background:#060102;color:#efe6e0;font-family:'M',Impact,sans-serif}
.w{position:relative;overflow:hidden;background:#060102;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
canvas{position:absolute;inset:0}
.t{position:relative;text-shadow:0 0 18px rgba(255,42,53,.7),0 0 2px #ff2a35;color:#ff2a35;letter-spacing:.04em;line-height:1}
.s{position:relative;font-family:Georgia,'Times New Roman',serif;color:#efe6e0;letter-spacing:.32em;text-transform:uppercase;font-size:15px}`;
function rain(w, h, seed) {
  return `<canvas id=c width=${w} height=${h}></canvas><script>
  var c=document.getElementById('c'),x=c.getContext('2d'),r=${seed};function R(){r=(r*16807)%2147483647;return r/2147483647}
  var ch='ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789';x.font='16px monospace';
  for(var i=0;i<${Math.ceil(w / 17)};i++){var len=6+Math.floor(R()*22),y0=Math.floor(R()*${Math.ceil(h / 17)});
   for(var j=0;j<len;j++){var a=(1-j/len);x.fillStyle='rgba(255,42,53,'+(0.05+a*0.32)+')';if(j==0)x.fillStyle='rgba(255,170,175,.75)';
    x.fillText(ch[Math.floor(R()*ch.length)],i*17,(y0-j)*17);}}
  var g=x.createLinearGradient(0,0,0,${h});g.addColorStop(0,'rgba(6,1,2,0)');g.addColorStop(1,'rgba(6,1,2,.35)');x.fillStyle=g;x.fillRect(0,0,${w},${h});</script>`;
}
const pages = {
  masthead: { w: 1200, h: 420, html: rain(1200, 420, 7) + `<div class=t style="font-size:150px">SOBERING STORIES</div><div class=s style="margin-top:22px">The Weekly Edition &nbsp;·&nbsp; supsobers.com</div>` },
  breaking: { w: 1200, h: 150, html: rain(1200, 150, 11) + `<div class=t style="font-size:96px;color:#efe6e0;text-shadow:0 0 14px rgba(255,42,53,.9)">BREAKING NEWS</div>` },
  other: { w: 1200, h: 130, html: rain(1200, 130, 23) + `<div class=t style="font-size:78px">OTHER NEWS</div>` },
  fall: { w: 1200, h: 130, html: rain(1200, 130, 31) + `<div class=t style="font-size:78px">KEEP FALLING</div>` },
  footer: { w: 1200, h: 220, html: rain(1200, 220, 47) + `<div class=t style="font-size:64px">SUP SOBERS</div><div class=s style="margin-top:14px;font-size:14px">Every episode, transcript and connection &nbsp;·&nbsp; supsobers.com</div>` }
};
(async () => {
  const b = await chromium.launch();
  for (const [name, p] of Object.entries(pages)) {
    const pg = await b.newPage({ viewport: { width: p.w, height: p.h } });
    await pg.setContent(`<style>${css}</style><div class=w style="width:${p.w}px;height:${p.h}px">${p.html}</div>`);
    await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(400);
    await pg.screenshot({ path: path.join(out, name + '.png') }); await pg.close();
  }
  await b.close();
})();
