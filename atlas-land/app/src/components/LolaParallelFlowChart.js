import React, { useEffect, useRef, useState } from 'react';

const periodLabel=(period,resolution)=>String(period||'').replace('T',' ').replace('Z','')
  .slice(0,resolution==='year'?4:resolution==='month'?7:['day','week'].includes(resolution)?10:16);

export default function LolaParallelFlowChart({line,samples,unit,resolution='hour',direction=1,animated=false,highlight=false,nearPercent=99,onChoosePeriod}) {
  const canvasRef=useRef(null), wrapperRef=useRef(null);
  const [start,setStart]=useState(0),[windowSize,setWindowSize]=useState(null),[cursor,setCursor]=useState(0),[size,setSize]=useState({width:1000,height:96});
  const count=samples.length, length=Math.min(windowSize||count,count), offset=Math.min(start,Math.max(0,count-length));
  const current=samples[Math.min(cursor,count-1)];
  useEffect(()=>{setStart(0);setWindowSize(null);setCursor(0);},[samples]);
  useEffect(()=>{
    const element=wrapperRef.current;
    if(!element)return undefined;
    const resize=()=>setSize({width:element.clientWidth||1000,height:96});resize();
    if(!window.ResizeObserver)return undefined;
    const observer=new ResizeObserver(resize);observer.observe(element);return()=>observer.disconnect();
  },[Boolean(count)]);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas||!line||!count)return undefined;
    const ctx=canvas.getContext('2d');if(!ctx)return undefined;
    const dpr=Math.min(window.devicePixelRatio||1,2), {width:W,height:H}=size;
    canvas.width=W*dpr;canvas.height=H*dpr;
    const css=getComputedStyle(wrapperRef.current), token=(name,fallback)=>css.getPropertyValue(name).trim()||fallback;
    const ink=token('--atlas-map-text','CanvasText'),muted=token('--atlas-map-muted','GrayText'),rail=token('--border-strong','GrayText');
    const forward=token('--accent-primary','CanvasText'),reverse=token('--atlas-map-muted','GrayText'),near=token('--accent-warning','CanvasText');
    const left=80,right=W-55,top=12,bottom=64,span=Math.max(1,right-left), maximum=samples.reduce((max,item)=>Math.max(max,Math.abs(item.value||0)),1);
    const stride=Math.max(1,Math.ceil(length/span));
    // Summarise once per view, not on every animation frame.
    const buckets=[];
    for(let i=0;i<length;i+=stride){
      const valid=samples.slice(offset+i,offset+Math.min(length,i+stride)).filter(item=>item.value!=null);
      if(valid.length)buckets.push({i,sample:valid.reduce((a,b)=>Math.abs(a.value)>=Math.abs(b.value)?a:b),
        atLimit:valid.some(item=>item.maximumRatio>=nearPercent/100),mixed:valid.some(item=>item.value>0)&&valid.some(item=>item.value<0)});
    }
    const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');let raf=null,stopped=false;
    const draw=time=>{
      raf=null;if(stopped||document.hidden)return;
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
      ctx.font='12px Inter, sans-serif';ctx.textAlign='right';ctx.fillStyle=ink;
      ctx.fillText(line.from_node,left-12,top+5);ctx.fillText(line.to_node,left-12,bottom+5);
      ctx.strokeStyle=rail;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(right,top);ctx.moveTo(left,bottom);ctx.lineTo(right,bottom);ctx.stroke();
      for(const {i,sample,atLimit,mixed} of buckets){
        const value=sample.value*direction;
        const x=left+(i+.5)*span/Math.max(1,length), ratio=Math.min(1,Math.abs(sample.value)/maximum);
        ctx.strokeStyle=highlight&&atLimit?near:value<0?reverse:forward;ctx.fillStyle=ctx.strokeStyle;
        ctx.globalAlpha=highlight&&!atLimit ? .2 : .75;ctx.lineWidth=Math.max(.6,Math.min(3,stride*span/length)*(.35+.65*ratio));
        if(value===0){ctx.fillRect(x-1,(top+bottom)/2-1,2,2);continue;}
        ctx.beginPath();ctx.moveTo(x,top+2);ctx.lineTo(x,bottom-2);ctx.stroke();
        const phase=animated&&!media?.matches?(time/1400)%1:.56;
        const y=value<0?bottom-(bottom-top)*phase:top+(bottom-top)*phase;
        ctx.beginPath();ctx.arc(x,y,Math.min(3,1+ratio*2),0,Math.PI*2);ctx.fill();
        if(mixed){ctx.beginPath();ctx.arc(x,top+bottom-y,1.2,0,Math.PI*2);ctx.fill();}
      }
      ctx.globalAlpha=1;ctx.fillStyle=muted;ctx.font='11px Inter, sans-serif';ctx.textAlign='center';
      const ticks=Math.min(4,length-1);
      for(let i=0;i<=ticks;i++){const at=offset+Math.floor(ticks?i*(length-1)/ticks:0);ctx.fillText(periodLabel(samples[at]?.period,resolution),left+(ticks?i/ticks:.5)*span,H-7);}
      if(cursor>=offset&&cursor<offset+length){const x=left+(cursor-offset+.5)*span/length;ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,top-8);ctx.lineTo(x,bottom+8);ctx.stroke();}
      if(animated&&!media?.matches)raf=requestAnimationFrame(draw);
    };
    const redraw=()=>{if(raf!=null)cancelAnimationFrame(raf);raf=requestAnimationFrame(draw);};
    redraw();document.addEventListener('visibilitychange',redraw);media?.addEventListener?.('change',redraw);
    return()=>{stopped=true;if(raf!=null)cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',redraw);media?.removeEventListener?.('change',redraw);};
  },[samples,line,unit,resolution,direction,animated,highlight,nearPercent,offset,length,cursor,count,size]);
  const move=event=>{const box=event.currentTarget.getBoundingClientRect();const position=(event.clientX-box.left-80)/Math.max(1,box.width-135);setCursor(offset+Math.max(0,Math.min(length-1,Math.floor(position*length))));};
  if(!line||!count)return <p className="lola-flow-note">No reported history in this range. Missing periods are not zero flow.</p>;
  return <figure className="lola-parallel-chart">
    <div className="lola-history-navigation">
      <label>Position<input aria-label="History position" type="range" min="0" max={Math.max(0,count-length)} value={offset} disabled={length>=count} onChange={e=>setStart(Number(e.target.value))}/></label>
      <label>Visible periods<input aria-label="History zoom" type="range" min={Math.min(24,count)} max={count} value={length} onChange={e=>setWindowSize(Number(e.target.value))}/></label>
      <label>Inspect period<input aria-label="History inspected period" type="range" min="0" max={count-1} value={Math.min(cursor,count-1)} onChange={e=>setCursor(Number(e.target.value))}/></label>
      <span>{length.toLocaleString()} / {count.toLocaleString()}</span><button onClick={()=>{setStart(0);setWindowSize(null);}}>Reset zoom</button>
    </div>
    <div className="lola-history-canvas" ref={wrapperRef}><canvas ref={canvasRef} role="img" aria-label={'Parallel flow history for '+line.name} onMouseMove={move} /></div>
    <div className="lola-history-readout">
      <output>{periodLabel(current?.period,resolution)} · {current?.value==null?'Not reported':current.value.toLocaleString(undefined,{maximumFractionDigits:2})+' '+unit} · {current?.value==null?'No direction inferred':current.value===0?'No net flow':current.value*direction<0?line.to_node+' → '+line.from_node:line.from_node+' → '+line.to_node}
        {current?.valid>0?' · '+current.near+'/'+current.valid+' hours ≥'+nearPercent+'%':''}</output>
      {onChoosePeriod&&<button disabled={current?.value==null} title="Show this period at the current map resolution" onClick={()=>onChoosePeriod(current.firstPeriod||current.period)}>Show period on map</button>}
    </div>
  </figure>;
}
