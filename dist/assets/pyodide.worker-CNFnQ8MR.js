import{loadPyodide as o}from"https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.mjs";let r=null;const n=`
import sys
import io

class OutputCapture(io.StringIO):
    def __init__(self, callback):
        super().__init__()
        self.callback = callback

    def write(self, s):
        self.callback(s)
        return super().write(s)

# We will redirect stdout/stderr in the run function wrapper
`;async function i(){try{r=await o({indexURL:"https://cdn.jsdelivr.net/pyodide/v0.26.0/full/"}),await r.loadPackage("micropip"),await r.runPythonAsync(n),postMessage({type:"ready"})}catch(t){postMessage({type:"error",error:String(t)})}}async function c(t,s){if(!r){postMessage({id:t,type:"error",error:"Kernel not ready"});return}r.setStdout({batched:e=>{postMessage({id:t,type:"stdout",content:e})}}),r.setStderr({batched:e=>{postMessage({id:t,type:"stderr",content:e})}});try{await r.loadPackagesFromImports(s);const e=await r.runPythonAsync(s);postMessage({id:t,type:"success",result:e?.toString()})}catch(e){postMessage({id:t,type:"error",error:e.toString()})}}self.onmessage=async t=>{const{type:s,id:e,code:a}=t.data;s==="init"?await i():s==="run"&&await c(e,a)};
