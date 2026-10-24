fn cloudShape(p:vec3f)->f32 {
    let q=p.xz*8.;let cell=floor(q);var shape=0.;
    for(var z:i32=-1;z<=1;z++){for(var x:i32=-1;x<=1;x++){
        let id=cell+vec2f(f32(x),f32(z));let wrapped=id-floor(id/8.)*8.;
        let h=fract(sin(vec3f(dot(wrapped,vec2f(127.1,311.7)),dot(wrapped,vec2f(269.5,183.3)),dot(wrapped,vec2f(419.2,371.9))))*43758.5453);
        if(h.z<.49){continue;}
        let center=id+vec2f(.18)+h.xy*.64;
        for(var l:i32=0;l<6;l++){
            let phase=f32(l)*2.399+h.x*6.28;
            let offset=vec2f(cos(phase),sin(phase))*(.12+f32(l)*.065);
            let radius=.27+h.y*.13+f32(l)*.018;
            let d=vec3f((q-center-offset)/radius,(p.y-(.23+h.x*.15+f32(l)*.040))/(.20+h.y*.10));
            shape=max(shape,max(0.,1.-length(d)));
        }
    }}
    var v=vec3f(p.x*32.,p.y*8.,p.z*32.);var noise=0.;var amplitude=.55;var period=32.;
    for(var octave:i32=0;octave<3;octave++){
        let c=floor(v);var f=fract(v);f=f*f*(vec3f(3.)-2.*f);var value=0.;
        for(var z:i32=0;z<2;z++){for(var y:i32=0;y<2;y++){for(var x:i32=0;x<2;x++){
            let o=vec3f(f32(x),f32(y),f32(z));var id=c+o;
            id=vec3f(id.x-floor(id.x/period)*period,id.y,id.z-floor(id.z/period)*period);
            let h=fract(sin(dot(id,vec3f(127.1,311.7,74.7)))*43758.5453);
            let w=mix(vec3f(1.)-f,f,o);value+=h*w.x*w.y*w.z;
        }}}
        noise+=value*amplitude;amplitude*=.5;v*=2.;period*=2.;
    }
    return smoothstep(.025,.16,shape-(1.-noise)*.42)*smoothstep(.015,.13,p.y)*(1.-smoothstep(.78,.98,p.y));
}
