// Keep only the newest image; emulator and audio clocks never wait for rendering.
export function createPresenter(draw,{request=requestAnimationFrame,cancel=cancelAnimationFrame}={}){
  let pending,scheduled=0,presented=0,replaced=0;
  const release=frame=>frame?.release(frame.rgba.buffer);
  return {
    submit(rgba,returnBuffer){
      if(pending){release(pending);replaced++;}
      pending={rgba,release:returnBuffer};
      if(!scheduled)scheduled=request(()=>{
        scheduled=0;const frame=pending;pending=null;
        if(frame){try{draw(frame.rgba);presented++;}finally{release(frame);}}
      });
    },
    clear(){if(scheduled)cancel(scheduled);scheduled=0;release(pending);pending=null;presented=0;replaced=0;},
    stats(){return {presented,replaced};}
  };
}
