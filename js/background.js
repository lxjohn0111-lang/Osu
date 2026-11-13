// Audio-reactive WebGL backdrop. Six procedural scenes in one fragment shader, cross-faded
// when the selected track changes. Falls back to a CSS gradient if WebGL is unavailable.
import { hexToRgb, lerp } from './util.js';

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FS = `
precision highp float;
uniform vec2 uRes; uniform float uTime,uBass,uBeat,uDim,uFever,uMix,uSA,uSB;
uniform vec3 uC1,uC2,uC3; uniform vec3 uRip[4];
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
float stars(vec2 uv){vec2 g=uv*42.;vec2 id=floor(g);vec2 f=fract(g)-.5;float h=hash(id);
  float tw=.5+.5*sin(uTime*(1.+h*3.)+h*40.);return smoothstep(.12,0.,length(f+(vec2(hash(id+3.1),hash(id+7.7))-.5)*.6))*step(.9,h)*tw;}
vec3 aurora(vec2 uv){float t=uTime*.06;vec2 q=uv*1.4;
  float n1=fbm(q+vec2(t,-t*.7));float n2=fbm(q*1.7+vec2(-t*1.3,t)+n1*1.5);float n3=fbm(q*.8+n2*2.+vec2(0.,t*.5));
  vec3 col=mix(uC1*.22,uC2*.55,smoothstep(.2,.8,n2));
  col=mix(col,uC3*.85,smoothstep(.55,.95,n3)*(.45+uBass*.8));
  float cur=pow(max(0.,sin(uv.x*3.+n1*4.+t*4.))*.5+.5,3.)*smoothstep(-.6,.5,uv.y+n2*.4);
  col+=uC3*cur*.16*(1.+uBeat);col+=stars(uv)*.5;return col;}
vec3 synth(vec2 uv){float hor=-.08;vec3 col;
  if(uv.y>hor){float g=uv.y-hor;col=mix(uC1*.5,vec3(.02,0.,.07),smoothstep(0.,.7,g));
    vec2 sp=uv-vec2(0.,hor+.2);float d=length(sp);float r=.25+uBeat*.012;
    float k=clamp((sp.y+r)/(2.*r),0.,1.);
    float cut=smoothstep(-.06,.06,sin((sp.y-uTime*.025)*58.)+sp.y*11.+.55);
    vec3 sc=mix(uC1,vec3(1.,.85,.35),k);
    col=mix(col,sc,smoothstep(r,r-.006,d)*cut);
    col+=uC1*.3*exp(-d*4.5)*(1.+uBass);col+=stars(uv)*smoothstep(.1,.5,uv.y)*.7;}
  else{float z=1./(hor-uv.y+.0005);vec2 p=vec2(uv.x*z*.9,z*.6+uTime*(1.2+uFever*.8));
    vec2 gq=abs(fract(p)-.5);float w=.02+z*.004;
    float line=max(smoothstep(w,0.,gq.x),smoothstep(w*1.6,0.,gq.y));
    float fade=exp(-z*.11);
    col=vec3(.03,0.,.08)+uC3*line*fade*(.55+uBeat*.7+uBass*.6);
    col+=uC1*exp(-(hor-uv.y)*16.)*.7;}
  return col;}
vec3 tunnel(vec2 uv){float a=atan(uv.y,uv.x);float r=length(uv)+.001;
  float z=.35/r+uTime*(.3+uFever*.25);float seg=a/6.2831853*12.;
  float rings=abs(fract(z*1.5)-.5);float spokes=abs(fract(seg)-.5);
  float l=smoothstep(.05,0.,rings*r*2.5)+smoothstep(.04,0.,spokes*r*1.4)*.6;
  float id=floor(z*1.5);float fl=hash(vec2(id,floor(seg)));
  vec3 base=mix(uC1,uC2,fract(id*.37));
  vec3 col=base*l*(.45+uBeat*.7)*smoothstep(0.,.3,r);
  col+=mix(uC2,uC3,fl)*smoothstep(.82,1.,fl)*.2*smoothstep(.1,.5,r)*(.25+uBass*1.4)*(1.-smoothstep(.0,.5,rings*2.));
  col+=base*.05/(r+.25);
  col+=uC3*.4*exp(-r*5.5)*(1.+uBass*2.);col+=uC1*.06;return col;}
vec3 cells(vec2 uv){vec2 p=uv*3.+vec2(uTime*.05,uTime*.03);vec2 ip=floor(p),fp=fract(p);
  float md=8.,md2=8.,cid=0.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j));
    vec2 o=vec2(hash(ip+g),hash(ip+g+17.3));o=.5+.45*sin(uTime*.5+6.2831*o);
    float d=length(g+o-fp);if(d<md){md2=md;md=d;cid=hash(ip+g+3.1);}else if(d<md2){md2=d;}}
  float edge=md2-md;
  vec3 col=mix(uC1,uC2,cid)*.2*(.6+.4*sin(uTime*.7+cid*20.));
  col+=uC3*smoothstep(.07,0.,edge)*(.3+uBeat*.6);
  col+=mix(uC2,uC3,cid)*pow(max(0.,1.-md),6.)*uBass*.9;return col;}
vec3 waves(vec2 uv){vec3 col=mix(vec3(.01,.02,.07),uC1*.32,smoothstep(-.6,.7,uv.y));
  float d=length(uv-vec2(.42,.24));col+=uC3*(smoothstep(.085,.08,d)*.75+.22*exp(-d*5.));
  col+=stars(uv)*smoothstep(-.05,.3,uv.y)*.8;
  for(int i=0;i<5;i++){float fi=float(i);
    float y=-.06-fi*.09+.035*sin(uv.x*(2.+fi*.7)+uTime*(.3+fi*.08)+fi*1.7)+.012*sin(uv.x*9.-uTime*.6+fi)*(1.+uBass*2.5);
    float m=smoothstep(y+.004,y-.004,uv.y);vec3 wc=mix(uC2,uC1,fi/5.)*(.45-fi*.06);
    col=mix(col,wc*.5,m);col+=uC3*smoothstep(.01,0.,abs(uv.y-y))*.3*(1.+uBeat);}
  return col;}
vec3 pixel(vec2 uv){float px=26.;vec2 p=floor(uv*px)/px;vec2 f=fract(uv*px);
  float v=sin(p.x*4.+uTime*.6)+sin(p.y*5.-uTime*.4)+sin((p.x+p.y)*3.+uTime*.3)+sin(length(p)*6.-uTime*.8);
  v=v*.25+.5;float q=floor(v*5.)/5.;
  vec3 col=mix(mix(uC1,uC2,q),uC3,smoothstep(.7,1.,q))*(.14+.22*q);
  float h=hash(p*91.7+floor(uTime*2.));col+=uC3*step(.985-uBass*.04,h)*.5;
  col*=.82+.18*step(.07,f.x)*step(.07,f.y);return col*(1.+uBeat*.3);}
vec3 scene(float s,vec2 uv){
  if(s<.5)return aurora(uv);if(s<1.5)return synth(uv);if(s<2.5)return tunnel(uv);
  if(s<3.5)return cells(uv);if(s<4.5)return waves(uv);return pixel(uv);}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  for(int i=0;i<4;i++){vec3 rp=uRip[i];if(rp.z<1.6){vec2 dv=uv-rp.xy;float d=length(dv)+.0001;float fr=rp.z*.75;
    uv+=dv/d*.016*sin(34.*(d-fr))*exp(-rp.z*3.2)*smoothstep(.22,0.,abs(d-fr));}}
  vec3 col=scene(uSA,uv);
  if(uMix>.002)col=mix(col,scene(uSB,uv),uMix);
  col*=1.+uBeat*.1+uFever*.12;
  col+=uC3*uFever*.05*smoothstep(.3,1.1,length(uv));
  col*=1.-.42*smoothstep(.35,1.25,length(uv));
  col=1.-exp(-col*1.7);
  col*=1.-uDim;
  gl_FragColor=vec4(col,1.);}
`;

export const BG_NAMES = ['aurora', 'synth', 'tunnel', 'cells', 'waves', 'pixel'];

export class Background {
  constructor(canvas) {
    this.canvas = canvas; this.ok = false; this.scale = 0.6;
    this.styleA = 0; this.styleB = 0; this.mix = 0;
    this.c = [[0.7, 0.1, 1], [1, 0.25, 0.64], [1, 0.82, 0.4]]; this.tc = this.c.map((x) => x.slice());
    this.dim = 0; this.tdim = 0; this.fever = 0; this.tfever = 0; this.beat = 0; this.bass = 0;
    this.rip = [[0, 0, 9], [0, 0, 9], [0, 0, 9], [0, 0, 9]]; this.ripI = 0; this.t0 = performance.now(); this.last = this.t0;
    try { this._init(); } catch (e) { console.warn('[bg] WebGL unavailable', e); }
    if (!this.ok) canvas.classList.add('nogl');
  }
  _init() {
    const gl = (this.gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' }));
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['uRes', 'uTime', 'uBass', 'uBeat', 'uDim', 'uFever', 'uMix', 'uSA', 'uSB', 'uC1', 'uC2', 'uC3', 'uRip']) this.u[n] = gl.getUniformLocation(pr, n);
    this.ok = true;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; });
    this.canvas.addEventListener('webglcontextrestored', () => { try { this._init(); } catch (e) { /* stay on fallback */ } });
  }
  setQuality(q) { this.scale = q === 'low' ? 0.33 : q === 'medium' ? 0.5 : 0.7; this.resize(); }
  resize() {
    const w = Math.max(2, Math.round(Math.min(window.innerWidth * this.scale, 1400))), h = Math.max(2, Math.round((w * window.innerHeight) / Math.max(1, window.innerWidth)));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    if (this.ok) this.gl.viewport(0, 0, w, h);
  }
  setTheme(palette, style) {
    this.tc = palette.map((h) => hexToRgb(h).map((v) => v / 255));
    const cur = this._fading ? this.styleB : this.styleA;
    if (style === cur) return;
    if (this._fading && this.mix > 0.5) this.styleA = this.styleB;
    this.styleB = style; this.mix = 0; this._fading = true;
  }
  /** x,y in CSS pixels */
  ripple(x, y) {
    const h = window.innerHeight;
    this.rip[this.ripI] = [(x - window.innerWidth / 2) / h, -(y - h / 2) / h, 0];
    this.ripI = (this.ripI + 1) % 4;
  }
  draw(now, { bass = 0, beat = 0 } = {}) {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) this.c[i][k] = lerp(this.c[i][k], this.tc[i][k], Math.min(1, dt * 3));
    this.dim = lerp(this.dim, this.tdim, Math.min(1, dt * 4));
    this.fever = lerp(this.fever, this.tfever, Math.min(1, dt * 5));
    if (this._fading) { this.mix = Math.min(1, this.mix + dt * 1.6); if (this.mix >= 1) { this.styleA = this.styleB; this.mix = 0; this._fading = false; } }
    for (const r of this.rip) r[2] += dt;
    if (!this.ok) return;
    const gl = this.gl, u = this.u;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, ((now - this.t0) / 1000) % 3600);
    gl.uniform1f(u.uBass, bass); gl.uniform1f(u.uBeat, beat); gl.uniform1f(u.uDim, this.dim); gl.uniform1f(u.uFever, this.fever);
    gl.uniform1f(u.uMix, this.mix); gl.uniform1f(u.uSA, this.styleA); gl.uniform1f(u.uSB, this.styleB);
    gl.uniform3fv(u.uC1, this.c[0]); gl.uniform3fv(u.uC2, this.c[1]); gl.uniform3fv(u.uC3, this.c[2]);
    gl.uniform3fv(u.uRip, new Float32Array(this.rip.flat()));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
