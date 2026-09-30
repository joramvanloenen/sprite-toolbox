import { cleanBackground, isolateObjects, cropSprite, bleedTransparent, encodePNG } from './core.js';
let source = null, cleaned = null, detection = null;
self.onmessage = async ({data:message}) => {
  const {type,id}=message;
  try {
    if(type==='source') { source={data:new Uint8ClampedArray(message.buffer),width:message.width,height:message.height}; cleaned=null;detection=null;self.postMessage({type,id}); }
    if(type==='process') {
      if(!source) throw new Error('Open a source image first.');
      cleaned=cleanBackground(source.data,source.width,source.height,message.options);
      detection=isolateObjects(cleaned,source.width,source.height,message.options);
      const preview=cleaned.slice();self.postMessage({type,id,buffer:preview.buffer,groups:detection.groups},[preview.buffer]);
    }
    if(type==='extract') {
      if(!detection||!cleaned) throw new Error('Wait for detection to finish.');
      const sprites=detection.groups.map(g=>({width:g.width,height:g.height,buffer:cropSprite(cleaned,source.width,g,detection.labels).buffer}));
      self.postMessage({type,id,sprites},sprites.map(s=>s.buffer));
    }
    if(type==='export') {
      const data=bleedTransparent(new Uint8ClampedArray(message.buffer),message.width,message.height,message.bleed,message.regions);
      const blob=await encodePNG(data,message.width,message.height);self.postMessage({type,id,blob});
    }
  } catch(error) { self.postMessage({type:'error',id,message:error.message}); }
};
