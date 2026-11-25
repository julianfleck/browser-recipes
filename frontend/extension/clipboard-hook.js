(() => {
 if(globalThis.__bridgeCopyHook)return;globalThis.__bridgeCopyHook=true;
 // Signal only that a website copy control was used. Never export clipboard contents.
 const clipboard=navigator.clipboard;if(!clipboard?.writeText)return;
 const original=clipboard.writeText.bind(clipboard);
 try{clipboard.writeText=async text=>{const result=await original(text);document.dispatchEvent(new CustomEvent('bridge:website-copy'));return result;};}catch{}
})();
