/* Shared VR mode for the AI games.
   Load it in <head>, before the game's own script:  <script src="vr.js"></script>
   - Adds a PLAY IN VR button when the browser can do immersive VR (e.g. Meta Quest Browser).
   - Shows the game's canvas on a big floating screen in a starfield above a neon floor grid.
   - Turns the Quest Touch controllers into one standard gamepad, so any game that reads
     navigator.getGamepads() just works:
       A 0 · B 1 · X 2 · Y 9 (Start) · L grip 4 · R grip 5 · L trigger 6 · R trigger 7
       L stick click 3 · R stick click 8 · left stick axes 0/1 · right stick axes 2/3
   - Keeps requestAnimationFrame games running while in VR (the page's own loop is paused there).
   Options on the script tag: data-canvas="#id" picks the canvas (default: the biggest one).
   Games can opt into more depth through window.VR:
     VR.active       true while in VR (read it to skip a 2D backdrop)
     VR.transparent  set true to let the 3D starfield show through the canvas's clear areas
     VR.motion       set to a function returning [vx, vy] in screen heights per second
                     (y down); the 3D stars stream past opposite to it, as if you were flying */
(function(){
  const me = document.currentScript;
  const opt = (me && me.dataset) || {};
  const VR = window.VR = { active:false, transparent:false, motion:null };

  // ---- requestAnimationFrame relay: native outside VR, the XR session's frame loop inside ----
  const nativeRAF = window.requestAnimationFrame.bind(window), nativeCAF = window.cancelAnimationFrame.bind(window);
  let queue = new Map(), nextId = 1, pending = 0, session = null;
  function flush(t){
    pending = 0;
    const q = queue; queue = new Map();
    q.forEach(cb => { try{ cb(t); }catch(e){ console.error(e); } });
  }
  window.requestAnimationFrame = cb => {
    const id = nextId++; queue.set(id, cb);
    if(!session && !pending) pending = nativeRAF(flush);
    return id;
  };
  window.cancelAnimationFrame = id => { queue.delete(id); };

  // ---- virtual gamepad built from the Touch controllers ----
  const nativePads = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : () => [];
  const MAP = { right:{0:7, 1:5, 3:8, 4:0, 5:1}, left:{0:6, 1:4, 3:3, 4:2, 5:9} };
  const pad = {
    id:'Meta Quest Touch (VR)', index:0, connected:true, mapping:'standard', timestamp:0,
    axes:[0,0,0,0], buttons:Array.from({length:17}, () => ({pressed:false, touched:false, value:0})),
    vibrationActuator:null
  };
  let haptic = null;
  pad.vibrationActuator = { type:'dual-rumble', playEffect(type, p){
    const h = haptic; if(h && h.pulse) try{ h.pulse(Math.min(1, (p&&p.strongMagnitude)||.5), (p&&p.duration)||100); }catch(e){}
    return Promise.resolve('complete');
  }, reset(){ return Promise.resolve('complete'); } };
  navigator.getGamepads = () => session ? [pad, null, null, null] : nativePads();

  function readControllers(){
    for(const b of pad.buttons){ b.pressed = false; b.touched = false; b.value = 0; }
    pad.axes[0] = pad.axes[1] = pad.axes[2] = pad.axes[3] = 0;
    haptic = null;
    for(const src of session.inputSources){
      const g = src.gamepad; if(!g) continue;
      const hand = src.handedness === 'left' ? 'left' : 'right';
      const m = MAP[hand];
      for(const i in m){
        const s = g.buttons[i]; if(!s) continue;
        const d = pad.buttons[m[i]];
        d.pressed = d.pressed || s.pressed || s.value > .5;
        d.touched = d.touched || s.touched;
        d.value = Math.max(d.value, s.value || (s.pressed ? 1 : 0));
      }
      const x = g.axes.length > 2 ? g.axes[2] : g.axes[0] || 0, y = g.axes.length > 2 ? g.axes[3] : g.axes[1] || 0;
      const k = hand === 'left' ? 0 : 2;
      pad.axes[k] = x || 0; pad.axes[k+1] = y || 0;
      if(hand === 'right' && g.hapticActuators && g.hapticActuators[0]) haptic = g.hapticActuators[0];
    }
    pad.timestamp = performance.now();
  }

  // ---- the PLAY IN VR button ----
  const btn = document.createElement('button');
  btn.textContent = 'PLAY IN VR';
  btn.style.cssText = 'position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483000;' +
    'font:700 15px/1 ui-monospace,monospace;letter-spacing:.08em;padding:12px 22px;border:1px solid #27f0ff;border-radius:6px;' +
    'background:rgba(5,6,15,.85);color:#27f0ff;box-shadow:0 0 16px rgba(39,240,255,.5);cursor:pointer';
  btn.hidden = true;
  btn.onclick = e => { e.stopPropagation(); enter(); };
  const addBtn = () => document.body.appendChild(btn);
  if(document.body) addBtn(); else addEventListener('DOMContentLoaded', addBtn);
  if(navigator.xr && navigator.xr.isSessionSupported)
    navigator.xr.isSessionSupported('immersive-vr').then(ok => { btn.hidden = !ok; }).catch(() => {});

  function pickCanvas(){
    if(opt.canvas){ const c = document.querySelector(opt.canvas); if(c) return c; }
    let best = null, area = 0;
    for(const c of document.querySelectorAll('canvas')){
      const r = c.getBoundingClientRect(), a = r.width * r.height;
      if(a > area){ area = a; best = c; }
    }
    return best;
  }

  // help card under the screen
  function helpCanvas(){
    const c = document.createElement('canvas'); c.width = 1024; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(5,6,15,.8)'; x.fillRect(0, 0, 1024, 96);
    x.strokeStyle = '#1b2a6b'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, 1021, 93);
    x.textAlign = 'center'; x.font = '23px ui-monospace,monospace';
    x.fillStyle = '#27f0ff'; x.fillText('Sticks move / aim · Trigger fire · A B X buttons · Y start / pause', 512, 40);
    x.fillStyle = '#7684c4'; x.fillText('Grips are bumpers · Press the Meta button to leave VR', 512, 76);
    return c;
  }

  const mul4 = (a, b) => { const o = new Float32Array(16); for(let c=0;c<4;c++) for(let r=0;r<4;r++){ let s=0; for(let k=0;k<4;k++) s += a[k*4+r]*b[c*4+k]; o[c*4+r] = s; } return o; };
  const place = (w, h, x, y, z) => new Float32Array([w/2,0,0,0, 0,h/2,0,0, 0,0,1,0, x,y,z,1]);

  async function enter(){
    let s;
    try{
      s = await navigator.xr.requestSession('immersive-vr', {optionalFeatures:['local-floor']});
    }catch(e){ alert('VR could not start here (' + (e && e.name || 'blocked') + '). Open this page directly in the Quest Browser.'); return; }
    const game = pickCanvas();
    const glc = document.createElement('canvas');
    const gl = glc.getContext('webgl', {xrCompatible:true, alpha:false, antialias:true});
    if(gl.makeXRCompatible) try{ await gl.makeXRCompatible(); }catch(e){}
    s.updateRenderState({baseLayer:new XRWebGLLayer(s, gl)});
    let ref, floor = true;
    try{ ref = await s.requestReferenceSpace('local-floor'); }catch(e){ ref = await s.requestReferenceSpace('local'); floor = false; }
    const eye = floor ? 1.5 : 0;   // screen centre at roughly head height

    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const link = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); return p; };
    const quadProg = link('attribute vec2 p;uniform mat4 m;varying vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=m*vec4(p,0.,1.);}',
      'precision mediump float;varying vec2 uv;uniform sampler2D t;uniform float a,k;void main(){vec4 c=texture2D(t,uv);gl_FragColor=vec4(c.rgb,mix(1.,c.a,k)*a);}');
    const glowProg = link('attribute vec2 p;uniform mat4 m;varying vec2 q;void main(){q=p;gl_Position=m*vec4(p,0.,1.);}',
      'precision mediump float;varying vec2 q;uniform vec3 c;uniform vec2 s;void main(){vec2 d=max(abs(q)-s,0.)/(1.-s);float o=length(d),g=o>0.?1.-clamp(o,0.,1.):0.;gl_FragColor=vec4(c*g*g*g*.7,1.);}');
    const lineProg = link('attribute vec4 a;uniform mat4 m;uniform vec3 o;uniform float h;varying float b;void main(){b=a.w*step(h,length(a.xyz-o));gl_Position=m*vec4(a.xyz,1.);gl_PointSize=max(1.,a.w*3.*14./gl_Position.w);}',
      'precision mediump float;varying float b;uniform vec3 c;void main(){gl_FragColor=vec4(c*b,1.);}');
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

    // stars fill an 80 m box around you (hidden within 6 m), and a floor grid that fades into the distance
    const NST = 2000, BOX = 40, stars = new Float32Array(NST*4);
    for(let i=0;i<NST;i++){
      stars[i*4] = (Math.random()*2-1)*BOX; stars[i*4+1] = eye + (Math.random()*2-1)*BOX; stars[i*4+2] = (Math.random()*2-1)*BOX; stars[i*4+3] = .3 + Math.random()*.7;
    }
    const starBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, starBuf); gl.bufferData(gl.ARRAY_BUFFER, stars, gl.DYNAMIC_DRAW);
    const wrapS = (v, c) => v < c - BOX ? v + 2*BOX : v > c + BOX ? v - 2*BOX : v;
    let lastT = 0;
    const gv = [], N = 40, fy = floor ? 0 : -1.5;
    for(let i=-N;i<=N;i++){
      for(let j=-N;j<N;j++){   // short segments so each can fade with distance
        const f = (a, b) => Math.max(0, 1 - Math.hypot(a, b)/N) * .55;
        gv.push(i, fy, j, f(i, j), i, fy, j+1, f(i, j+1));
        gv.push(j, fy, i, f(j, i), j+1, fy, i, f(j+1, i));
      }
    }
    const gridBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gv), gl.STATIC_DRAW);
    const gridCount = gv.length/4;

    const mkTex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; };
    const gameTex = mkTex(), helpTex = mkTex();
    gl.bindTexture(gl.TEXTURE_2D, helpTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, helpCanvas());

    // screen: 1.7 m tall at 2.6 m, width follows the game's aspect
    const D = 2.6;
    let screenM = place(3, 1.7, 0, eye, -D), glowM = screenM, glowS = [.8, .7];
    const fit = () => {
      const w = game ? game.width : 16, h = game ? game.height : 9;
      let sh = w < h ? 2.1 : 1.7, sw = sh * w / h; if(sw > 3.2){ sw = 3.2; sh = sw * h / w; }
      screenM = place(sw, sh, 0, eye, -D);
      helpM = place(1.9, .18, 0, eye - sh/2 - .32, -D + .3);
      glowM = place(sw + 1, sh + 1, 0, eye, -D - .01); glowS = [sw/(sw + 1), sh/(sh + 1)];
    };
    let helpM = place(1.9, .18, 0, eye - 1.17, -D + .3);

    const attr = (prog, name, size) => { const l = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); return l; };
    session = s; VR.active = true;
    window.goatcounter&&goatcounter.count&&goatcounter.count({path:'vr'+location.pathname,title:'VR: '+document.title,event:true});   // GoatCounter event
    if(pending){ nativeCAF(pending); pending = 0; }
    btn.hidden = true;

    const onFrame = (t, xf) => {
      if(session !== s) return;
      s.requestAnimationFrame(onFrame);
      readControllers();
      flush(t);   // run the game's frame
      const dt = Math.min(.05, (t - lastT)/1000 || 0); lastT = t;
      const mv = VR.motion && VR.motion();
      if(mv && (mv[0] || mv[1])){   // stream the stars opposite the game's motion (its y is down, VR's is up)
        const kx = -mv[0]*1.7*3*dt, ky = mv[1]*1.7*3*dt;
        for(let i=0;i<NST;i++){ stars[i*4] = wrapS(stars[i*4] + kx, 0); stars[i*4+1] = wrapS(stars[i*4+1] + ky, eye); }
        gl.bindBuffer(gl.ARRAY_BUFFER, starBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, stars);
      }
      const pose = xf.getViewerPose(ref); if(!pose) return;
      if(game){ fit(); gl.bindTexture(gl.TEXTURE_2D, gameTex); try{ gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, game); }catch(e){} }
      const BL = s.renderState.baseLayer;
      gl.bindFramebuffer(gl.FRAMEBUFFER, BL.framebuffer);
      gl.clearColor(.012, .014, .04, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
      for(const v of pose.views){
        const vp = BL.getViewport(v); gl.viewport(vp.x, vp.y, vp.width, vp.height);
        const pv = mul4(v.projectionMatrix, v.transform.inverse.matrix);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(lineProg);
        gl.uniformMatrix4fv(gl.getUniformLocation(lineProg, 'm'), false, pv);
        gl.uniform3f(gl.getUniformLocation(lineProg, 'o'), 0, eye, 0); gl.uniform1f(gl.getUniformLocation(lineProg, 'h'), 6);
        gl.bindBuffer(gl.ARRAY_BUFFER, starBuf); let l = attr(lineProg, 'a', 4);
        gl.uniform3f(gl.getUniformLocation(lineProg, 'c'), .8, .85, 1); gl.drawArrays(gl.POINTS, 0, NST);
        gl.uniform1f(gl.getUniformLocation(lineProg, 'h'), 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf); attr(lineProg, 'a', 4);
        gl.uniform3f(gl.getUniformLocation(lineProg, 'c'), .2, .55, 1); gl.drawArrays(gl.LINES, 0, gridCount);
        gl.disableVertexAttribArray(l);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.useProgram(glowProg); l = attr(glowProg, 'p', 2);
        gl.uniformMatrix4fv(gl.getUniformLocation(glowProg, 'm'), false, mul4(pv, glowM));
        gl.uniform2f(gl.getUniformLocation(glowProg, 's'), glowS[0], glowS[1]); gl.uniform3f(gl.getUniformLocation(glowProg, 'c'), .15, .9, 1); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disableVertexAttribArray(l);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(quadProg); l = attr(quadProg, 'p', 2);
        const mu = gl.getUniformLocation(quadProg, 'm'), au = gl.getUniformLocation(quadProg, 'a'), ku = gl.getUniformLocation(quadProg, 'k');
        gl.uniform1f(ku, VR.transparent ? 1 : 0); gl.uniform1f(au, 1); gl.bindTexture(gl.TEXTURE_2D, gameTex); gl.uniformMatrix4fv(mu, false, mul4(pv, screenM)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.uniform1f(ku, 0); gl.uniform1f(au, .9); gl.bindTexture(gl.TEXTURE_2D, helpTex); gl.uniformMatrix4fv(mu, false, mul4(pv, helpM)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disableVertexAttribArray(l);
      }
    };
    s.addEventListener('end', () => {
      session = null; VR.active = false; btn.hidden = false;
      if(queue.size && !pending) pending = nativeRAF(flush);
      dispatchEvent(new Event('resize'));
    });
    s.requestAnimationFrame(onFrame);
    const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', {value:pad}); dispatchEvent(ev);
  }
})();
