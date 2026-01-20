import{loadPyodide as i}from"https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.mjs";let t=null;const _=`
import sys
import io
import contextvars
from pyodide.code import eval_code_async

# Context variable to track which cell is currently executing
current_cell_id = contextvars.ContextVar("current_cell_id", default=None)

# Callback to JS
_publish_stream_callback = None

def register_stream_callback(cb):
    global _publish_stream_callback
    _publish_stream_callback = cb

class ContextAwareOutput(io.TextIOBase):
    def __init__(self, name):
        self.name = name

    def write(self, s):
        cell_id = current_cell_id.get()
        if _publish_stream_callback and cell_id:
            _publish_stream_callback(cell_id, self.name, s)
        return len(s)

sys.stdout = ContextAwareOutput("stdout")
sys.stderr = ContextAwareOutput("stderr")

async def run_cell_code(code, cell_id):
    token = current_cell_id.set(cell_id)
    try:
        # Execute code in the global namespace
        res = await eval_code_async(code, globals=globals())
        
        # Auto-wrap lists of UIElements into a Group
        if isinstance(res, list) and res:
            # Check if likely a list of UI elements (duck typing)
            if all(hasattr(x, '_repr_mimebundle_') for x in res):
                try:
                    from pynote_ui.elements import Group
                    return Group(res)
                except ImportError:
                    pass
        return res
    finally:
        current_cell_id.reset(token)
`;async function p(){try{t=await i({indexURL:"https://cdn.jsdelivr.net/pyodide/v0.26.0/full/"}),await t.loadPackage("micropip");const r=t.pyimport("micropip");console.log("Installing pynote_ui..."),await r.install(self.location.origin+"/packages/pynote_ui-0.1.0-py3-none-any.whl"),console.log("pynote_ui installed successfully."),await t.runPythonAsync(_);const o=t.globals.get("register_stream_callback");o((l,e,c)=>{postMessage({id:l,type:e,content:c})}),o.destroy();const s=t.pyimport("pynote_ui");s.register_comm_target((l,e)=>{const c=e.toJs({dict_converter:Object.fromEntries});postMessage({type:"component_update",uid:l,data:c})}),s.destroy(),postMessage({type:"ready"})}catch(r){postMessage({type:"error",error:String(r)})}}async function d(r,o){if(!t){postMessage({id:r,type:"error",error:"Kernel not ready"});return}try{await t.loadPackagesFromImports(o);const s=t.globals.get("run_cell_code"),l=await s(o,r);s.destroy();let e;if(l&&l._repr_mimebundle_)try{const c=l._repr_mimebundle_();e=c.toJs({dict_converter:Object.fromEntries}),c.destroy()}catch(c){console.error("Error extracting mimebundle",c)}postMessage({id:r,type:"success",result:l?.toString(),mimebundle:e})}catch(s){postMessage({id:r,type:"error",error:s.toString()})}}self.onmessage=async r=>{const{type:o,id:s,code:l}=r.data;if(o==="init")await p();else if(o==="run")d(s,l);else if(o==="interaction"){const{uid:e,data:c}=r.data;if(t)try{const a=t.pyimport("pynote_ui"),n=t.toPy(c);a.handle_interaction(e,n),n.destroy(),a.destroy()}catch(a){console.error("Interaction error",a)}}else if(o==="set_cell_context"){if(t)try{const e=t.pyimport("pynote_ui");e.set_current_cell(s),e.destroy()}catch(e){console.error("Set cell context error",e)}}else if(o==="clear_cell_context"&&t)try{const e=t.pyimport("pynote_ui");e.clear_cell(s),e.destroy()}catch(e){console.error("Clear cell context error",e)}};
