import subprocess
import re
import csv
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
import os
import webbrowser
import threading

def get_process_map():
    """tasklist를 실행하여 PID -> Process Name 매핑을 생성합니다."""
    process_map = {}
    try:
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        output = subprocess.check_output('tasklist /FO CSV /NH', startupinfo=startupinfo, text=True, encoding='utf-8', errors='ignore')
        reader = csv.reader(output.strip().splitlines())
        for row in reader:
            if len(row) >= 2:
                name, pid_str = row[0], row[1]
                try:
                    process_map[int(pid_str)] = name
                except ValueError:
                    pass
    except Exception as e:
        print(f"Error getting process map: {e}")
    return process_map

def get_active_ports():
    """netstat -ano 결과를 파싱하고 프로세스명을 매핑하여 반환합니다."""
    process_map = get_process_map()
    ports = []
    try:
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        output = subprocess.check_output('netstat -ano', startupinfo=startupinfo, text=True, encoding='utf-8', errors='ignore')
        lines = output.strip().splitlines()
        for line in lines:
            line = line.strip()
            if not line:
                continue
            parts = re.split(r'\s+', line)
            
            # Proto가 TCP 또는 UDP인 라인만 처리합니다.
            if parts[0] not in ('TCP', 'UDP'):
                continue
            
            proto = parts[0]
            local_addr = parts[1]
            foreign_addr = parts[2]
            
            # TCP는 State 컬럼이 있지만, UDP는 없습니다.
            if proto == 'TCP':
                if len(parts) >= 5:
                    state = parts[3]
                    pid_str = parts[4]
                else:
                    state = "UNKNOWN"
                    pid_str = parts[-1]
            else:  # UDP
                state = "-"
                pid_str = parts[3] if len(parts) >= 4 else parts[-1]
                
            try:
                pid = int(pid_str)
            except ValueError:
                pid = -1
                
            process_name = process_map.get(pid, "Unknown")
            
            ports.append({
                "proto": proto,
                "local_address": local_addr,
                "foreign_address": foreign_addr,
                "state": state,
                "pid": pid,
                "process_name": process_name
            })
    except Exception as e:
        print(f"Error parsing ports: {e}")
    return ports

def kill_process(pid):
    """지정한 PID를 가진 프로세스를 강제 종료합니다."""
    try:
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        subprocess.check_output(f'taskkill /F /PID {pid}', startupinfo=startupinfo, text=True, encoding='utf-8', errors='ignore')
        return True, "프로세스가 성공적으로 종료되었습니다."
    except Exception as e:
        return False, f"종료 실패: {str(e)}"

class PortViewerHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.end_headers()
            
            html_path = os.path.join(os.path.dirname(__file__), 'port_viewer.html')
            if os.path.exists(html_path):
                with open(html_path, 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            else:
                self.wfile.write("<h3>오빠! port_viewer.html 파일을 찾을 수 없어 😭</h3>".encode('utf-8'))
                
        elif self.path == '/api/ports':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            ports = get_active_ports()
            self.wfile.write(json.dumps(ports).encode('utf-8'))
            
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found")
            
    def do_POST(self):
        if self.path == '/api/kill':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                pid = data.get('pid')
                if pid is not None:
                    success, message = kill_process(pid)
                    response = {"success": success, "message": message}
                else:
                    response = {"success": False, "message": "PID가 입력되지 않았어."}
            except Exception as e:
                response = {"success": False, "message": str(e)}
                
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found")
            
    def log_message(self, format, *args):
        # 터미널 창을 깨끗하게 유지하기 위해 요청 로그 출력을 비활성화합니다.
        pass

def open_browser():
    webbrowser.open("http://localhost:8500")

def run(server_class=HTTPServer, handler_class=PortViewerHandler, port=8500):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print("=" * 60)
    print(f"  [Port Viewer] 서버가 작동을 시작했습니다.")
    print(f"  - 주소: http://localhost:{port}")
    print(f"  - 종료하려면 터미널에서 Ctrl+C를 눌러주세요.")
    print("=" * 60)
    
    # 브라우저를 백그라운드 스레드에서 약간의 딜레이를 두고 자동 실행합니다.
    threading.Timer(0.5, open_browser).start()
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[Port Viewer] 서버를 종료합니다. 이용해 주셔서 감사합니다.")

if __name__ == '__main__':
    run()
