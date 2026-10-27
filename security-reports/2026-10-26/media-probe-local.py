import http.server,threading,tempfile,pathlib,subprocess,json
hits=[]
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  hits.append(self.path);self.send_response(200);self.send_header('Content-Type','video/mp2t');self.end_headers();self.wfile.write(b'\x47'+b'\0'*187)
 def log_message(self,*args):pass
server=http.server.HTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
p=pathlib.Path(tempfile.mkdtemp(prefix='sami-local-media-',dir='/private/tmp'))/'synthetic.mp4'
p.write_text('<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT1S" minBufferTime="PT1S"><Period><AdaptationSet mimeType="video/mp4"><Representation id="1" bandwidth="1000"><SegmentTemplate duration="1" timescale="1" media="http://127.0.0.1:'+str(server.server_port)+'/chunk-$Number$.m4s" initialization="http://127.0.0.1:'+str(server.server_port)+'/init.mp4" startNumber="1" /></Representation></AdaptationSet></Period></MPD>')
rows=[]
for label,options in [('current',[]),('proposed',['-protocol_whitelist','file,pipe,crypto,data'])]:
 hits.clear();r=subprocess.run(['ffprobe','-v','error']+options+[str(p)],capture_output=True,text=True,timeout=8)
 rows.append({'case':label,'requested_loopback_resources':list(hits),'exit':r.returncode,'stderr':r.stderr[-1300:]})
server.shutdown();pathlib.Path('/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/media-probe-local.json').write_text(json.dumps(rows,indent=2));print(json.dumps(rows,indent=2))
