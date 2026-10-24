float cloudShape(vec3 p) {
    // Eight periodic weather cells across 6 km. Clouds have separate, irregular
    // three-dimensional lobes, a condensation base, and eroded edges.
    vec2 q=p.xz*8.,cell=floor(q);float shape=0.;
    for(int z=-1;z<=1;z++)for(int x=-1;x<=1;x++){
        vec2 id=cell+vec2(float(x),float(z)),wrapped=mod(id,8.);
        vec3 h=fract(sin(vec3(dot(wrapped,vec2(127.1,311.7)),dot(wrapped,vec2(269.5,183.3)),dot(wrapped,vec2(419.2,371.9))))*43758.5453);
        if(h.z<.49)continue;
        vec2 center=id+.18+h.xy*.64;
        for(int l=0;l<6;l++){
            float phase=float(l)*2.399+h.x*6.28;
            vec2 offset=vec2(cos(phase),sin(phase))*(.12+float(l)*.065);
            float radius=.27+h.y*.13+float(l)*.018;
            vec3 d=vec3((q-center-offset)/radius,(p.y-(.23+h.x*.15+float(l)*.040))/(.20+h.y*.10));
            shape=max(shape,max(0.,1.-length(d)));
        }
    }
    vec3 v=vec3(p.x*32.,p.y*8.,p.z*32.);float noise=0.,amplitude=.55,period=32.;
    for(int octave=0;octave<3;octave++){
        vec3 c=floor(v),f=fract(v);f=f*f*(3.-2.*f);float value=0.;
        for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int x=0;x<2;x++){
            vec3 o=vec3(float(x),float(y),float(z)),id=c+o;
            id.xz=mod(id.xz,period);
            float h=fract(sin(dot(id,vec3(127.1,311.7,74.7)))*43758.5453);
            vec3 w=mix(1.-f,f,o);value+=h*w.x*w.y*w.z;
        }
        noise+=value*amplitude;amplitude*=.5;v*=2.;period*=2.;
    }
    return smoothstep(.025,.16,shape-(1.-noise)*.42)*smoothstep(.015,.13,p.y)*(1.-smoothstep(.78,.98,p.y));
}
