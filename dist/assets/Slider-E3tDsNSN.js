import{c as F,d as I,e as j,f as L,t as N,i,q as P,n as k,z as R,x as u,G as T,l as q,v as A}from"./framework-CVMD37SS.js";import{k as m}from"./index-CeSZeEe5.js";import"./katex-CFOwh_x2.js";import"./vendor-DGVArQ4Y.js";import"./milkdown-B618w8q7.js";import"./markdown-5gHqQypg.js";function G(r){return{"--p":"var(--primary)","--s":"var(--secondary)","--bc":"var(--foreground)","--b1":"var(--background)","--rounded-box":"var(--radius-sm)","--rounded-btn":"var(--radius-sm)","--rounded-badge":"var(--radius-sm)","font-family":"var(--font-mono)"}}var M=N('<div class="flex flex-col w-full border-2 border-foreground rounded-[var(--radius-sm)] bg-base-100/30 overflow-hidden"><style></style><div class="flex items-center justify-between px-3 py-2 bg-base-200/50 border-b-2 border-foreground"><span class="text-xs font-semibold uppercase tracking-wider text-secondary/70"></span><span class="font-mono text-sm font-bold text-primary"></span></div><div class="p-3 flex flex-col gap-1"><input type=range style=appearance:none;-webkit-appearance:none;background:transparent><div class="flex justify-between w-full px-0.5 mt-1"><span class="text-[10px] font-mono text-secondary/40"></span><span class="text-[10px] font-mono text-secondary/40">');const O=r=>{const d=r.id,[l,p]=F(r.props.value);let c;I(()=>{p(r.props.value)});const b=()=>{const e=r.props.min,n=r.props.max;return n===e?0:(l()-e)/(n-e)*100};j(()=>{m.registerComponentListener(d,e=>{typeof e.value=="number"&&p(e.value)})}),L(()=>{m.unregisterComponentListener(d)});const w=e=>{const n=e.currentTarget,s=parseFloat(n.value);p(s),m.sendInteraction(d,{value:s})},o=`slider-${d}`;return(()=>{var e=M(),n=e.firstChild,s=n.nextSibling,f=s.firstChild,C=f.nextSibling,S=s.nextSibling,a=S.firstChild,_=a.nextSibling,v=_.firstChild,z=v.nextSibling,x=c;return typeof x=="function"?q(x,e):c=e,i(n,`
          .${o}::-webkit-slider-runnable-track {
            height: 7px;
            background: var(--slider-gradient) !important;
            border-radius: var(--radius-sm);
            border: none !important;
            box-shadow: none !important;
          }
          .${o}::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            height: 16px;
            width: 16px;
            background: var(--primary) !important;
            border-radius: 50%;
            border: none !important;
            box-shadow: none !important;
            margin-top: -4.5px; /* Centers 16px thumb on 7px track */
          }
          
          /* Firefox */
          .${o}::-moz-range-track {
            height: 7px;
            background: var(--foreground) !important; /* Firefox uses progress for fill */
            border-radius: var(--radius-sm);
            border: none !important;
            box-shadow: none !important;
          }
          .${o}::-moz-range-progress {
            height: 7px;
            background: var(--primary) !important;
            border-radius: var(--radius-sm);
          }
          .${o}::-moz-range-thumb {
            height: 16px;
            width: 16px;
            background: var(--primary) !important;
            border: none !important;
            border-radius: 50%;
            box-shadow: none !important;
          }
        `),i(f,()=>r.props.label),i(C,l),a.$$input=w,P(a,`w-full cursor-pointer focus:outline-none ${o}`),i(v,()=>r.props.min),i(z,()=>r.props.max),k(t=>{var E=G(),g=r.props.min,h=r.props.max,y=r.props.step,$=`linear-gradient(to right, var(--primary) 0%, var(--primary) ${b()}%, var(--foreground) ${b()}%, var(--foreground) 100%)`;return t.e=R(e,E,t.e),g!==t.t&&u(a,"min",t.t=g),h!==t.a&&u(a,"max",t.a=h),y!==t.o&&u(a,"step",t.o=y),$!==t.i&&T(a,"--slider-gradient",t.i=$),t},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0}),k(()=>a.value=l()),e})()};A(["input"]);export{O as default};
