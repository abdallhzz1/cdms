import { useEffect, useRef, useState } from 'react';

declare global { interface Window { BarcodeDetector?: new (options?:{formats:string[]}) => { detect(source:CanvasImageSource):Promise<{rawValue:string}[]> } } }

export function LiveQrScanner({onDecoded,onError}:{onDecoded:(value:string)=>void;onError:(message:string)=>void}){
  const video=useRef<HTMLVideoElement>(null); const [active,setActive]=useState(false); const busy=useRef(false);
  useEffect(()=>{let stream:MediaStream|undefined;let timer:number|undefined;let cancelled=false; if(!active)return; if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){onError('تتطلب الكاميرا اتصالاً آمناً HTTPS ومتصفحاً حديثاً.');return;}
    void navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}).then(media=>{if(cancelled){media.getTracks().forEach(track=>track.stop());return;}stream=media;if(video.current){video.current.srcObject=media;void video.current.play();}if(!window.BarcodeDetector){onError('متصفحك لا يدعم ماسح QR المباشر. استخدم Chrome أو Edge حديثاً.');return;}const detector=new window.BarcodeDetector({formats:['qr_code']});timer=window.setInterval(()=>{if(!video.current||busy.current||document.hidden)return;void detector.detect(video.current).then(codes=>{const value=codes[0]?.rawValue;if(value){busy.current=true;onDecoded(value);window.setTimeout(()=>busy.current=false,1500);}}).catch(()=>undefined)},350);}).catch(()=>onError('تعذر فتح الكاميرا. اسمح بالكاميرا ثم أعد المحاولة.'));
    return()=>{cancelled=true;if(timer)window.clearInterval(timer);stream?.getTracks().forEach(track=>track.stop());};
  },[active,onDecoded,onError]);
  return <div className="space-y-3"><button type="button" onClick={()=>setActive(true)} className="w-full rounded-2xl bg-teal-700 px-4 py-3 text-sm font-black text-white">فتح كاميرا الحضور</button>{active&&<video ref={video} muted playsInline className="aspect-square w-full rounded-2xl bg-slate-900 object-cover"/>}</div>;
}
