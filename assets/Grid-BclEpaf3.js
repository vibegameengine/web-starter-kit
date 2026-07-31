import{g as e,y as t}from"./bootstrap-Dv1bajWw.js";import{$ as n,D as r,E as i,H as a,I as o,J as s,Z as c,et as l,m as u,rt as d}from"./index-C_bBMe1M.js";var f=t(e());function p(e,t,r,i){var o;return o=class extends c{constructor(a){super({vertexShader:t,fragmentShader:r,...a});for(let t in e)this.uniforms[t]=new n(e[t]),Object.defineProperty(this,t,{get(){return this.uniforms[t].value},set(e){this.uniforms[t].value=e}});this.uniforms=l.clone(this.uniforms),i?.(this)}},o.key=a.generateUUID(),o}var m=p({cellSize:.5,sectionSize:1,fadeDistance:100,fadeStrength:1,fadeFrom:1,cellThickness:.5,sectionThickness:1,cellColor:new o,sectionColor:new o,infiniteGrid:!1,followCamera:!1,worldCamProjPosition:new d,worldPlanePosition:new d},`
    varying vec3 localPosition;
    varying vec4 worldPosition;

    uniform vec3 worldCamProjPosition;
    uniform vec3 worldPlanePosition;
    uniform float fadeDistance;
    uniform bool infiniteGrid;
    uniform bool followCamera;

    void main() {
      localPosition = position.xzy;
      if (infiniteGrid) localPosition *= 1.0 + fadeDistance;
      
      worldPosition = modelMatrix * vec4(localPosition, 1.0);
      if (followCamera) {
        worldPosition.xyz += (worldCamProjPosition - worldPlanePosition);
        localPosition = (inverse(modelMatrix) * worldPosition).xyz;
      }

      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,`
    varying vec3 localPosition;
    varying vec4 worldPosition;

    uniform vec3 worldCamProjPosition;
    uniform float cellSize;
    uniform float sectionSize;
    uniform vec3 cellColor;
    uniform vec3 sectionColor;
    uniform float fadeDistance;
    uniform float fadeStrength;
    uniform float fadeFrom;
    uniform float cellThickness;
    uniform float sectionThickness;

    float getGrid(float size, float thickness) {
      vec2 r = localPosition.xz / size;
      vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
      float line = min(grid.x, grid.y) + 1.0 - thickness;
      return 1.0 - min(line, 1.0);
    }

    void main() {
      float g1 = getGrid(cellSize, cellThickness);
      float g2 = getGrid(sectionSize, sectionThickness);

      vec3 from = worldCamProjPosition*vec3(fadeFrom);
      float dist = distance(from, worldPosition.xyz);
      float d = 1.0 - min(dist / fadeDistance, 1.0);
      vec3 color = mix(cellColor, sectionColor, min(1.0, sectionThickness * g2));

      gl_FragColor = vec4(color, (g1 + g2) * pow(d, fadeStrength));
      gl_FragColor.a = mix(0.75 * gl_FragColor.a, gl_FragColor.a, g2);
      if (gl_FragColor.a <= 0.0) discard;

      #include <tonemapping_fragment>
      #include <${parseInt(`185`.replace(/\D+/g,``))>=154?`colorspace_fragment`:`encodings_fragment`}>
    }
  `),h=f.forwardRef(({args:e,cellColor:t=`#000000`,sectionColor:n=`#2080ff`,cellSize:a=.5,sectionSize:o=1,followCamera:c=!1,infiniteGrid:l=!1,fadeDistance:p=100,fadeStrength:h=1,fadeFrom:g=1,cellThickness:_=.5,sectionThickness:v=1,side:y=1,...b},x)=>{i({GridMaterial:m});let S=f.useRef(null);f.useImperativeHandle(x,()=>S.current,[]);let C=new s,w=new d(0,1,0),T=new d(0,0,0);r(e=>{C.setFromNormalAndCoplanarPoint(w,T).applyMatrix4(S.current.matrixWorld);let t=S.current.material,n=t.uniforms.worldCamProjPosition,r=t.uniforms.worldPlanePosition;C.projectPoint(e.camera.position,n.value),r.value.set(0,0,0).applyMatrix4(S.current.matrixWorld)});let E={cellSize:a,sectionSize:o,cellColor:t,sectionColor:n,cellThickness:_,sectionThickness:v},D={fadeDistance:p,fadeStrength:h,fadeFrom:g,infiniteGrid:l,followCamera:c};return f.createElement(`mesh`,u({ref:S,frustumCulled:!1},b),f.createElement(`gridMaterial`,u({transparent:!0,"extensions-derivatives":!0,side:y},E,D)),f.createElement(`planeGeometry`,{args:e}))});export{h as t};