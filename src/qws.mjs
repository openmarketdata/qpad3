import IPC from './ipc.mjs';

class QWebSocket {
  constructor(options={}) {
    const address = window.location.hostname + (window.location.port.toString() === "" ? "" : ":" + window.location.port);
    this.url = "http://" + address;
    this.uri = "ws://" + address + "?encoding=text";    
    this.connection = null;
    this.cm = null; // CodeMirror editor reference, set via setEditor()
  }

  /**
   * Attach a CodeMirror editor instance (must have .view, .disp, .setOpacity)
   * @param {object} editor
   */
  setEditor(editor) {
    this.cm = editor;
  }

  connect() {
    if (window.MozWebSocket) {
      window.WebSocket = window.MozWebSocket;
    } else if (!window.WebSocket) {
      throw new Error('This browser does not have support for WebSocket');
    }
    const zws = '0x010000004d01000064000a003d0100007b5b785d2e77732e6275663a2d3921783b683a6e65675b2e7a2e775d3b723a405b76616c75653b2e77732e6275663b7b5b683b785d2068202d3821283a3a3b2860636d2e646973703b28223d3e223b2227222c782929293b685b5d3b27787d5b685d5d3b633a73797374656d2263223b69665b3130683d7479706520723b68202d3821283a3a3b2860636d2e646973703b28223d3e223b245b635b315d3c636f756e745b725d3b225c22222c2828635b315d2d34292372292c222e2e5c22223b725d2929293b3a685b5d5d3b733a2e512e735b725d3b69665b303d636f756e745b732065786365707420225c6e225d3b68202d3821283a3a3b2860636d2e646973703b28223d3e223b2d3321722929293b3a685b5d5d3b68202d3821283a3a3b2860636d2e646973703b28223d3e223b2d315f732929293b3a685b5d7d';
    fetch(new URL(this.url+"/?(-8!.z.ws)~"+zws))
    .then((res) => {
      if (res.status==400){
        throw("400");
      } else {
        return res.text();
      }
    })
    .then((txt) => {
      const doc=document.createRange().createContextualFragment(txt);
      this.debug=doc;
      if(doc.querySelector('pre').innerText.replace(/[^\x20-\x7E]/g, '')==='1b') {this.onConnect();return;};
      if(confirm("WebSocket handle .z.ws is already set by others.\n\nClick [Ok] to overwrite and continue.\n[Cancel] to check .z.ws definition.")) {
        throw("overwrite");
      } else {
        window.location.replace(new URL(this.url+"/?.z.ws"));
        return;
      }
    })
    .catch((err) => {
      fetch(new URL(this.url+"/?.z.ws:-9!"+zws))
      .then((res) => {
        if(res.status==200) {
          this.onConnect();
        } else {
          throw new Error("fail to set .z.ws");
        }
      })
      .catch(alert);
    });
  }

  onConnect() {
    const websocket = new WebSocket(this.uri);
    websocket.binaryType = 'arraybuffer';
    this.connection = websocket;
    this.connection.onopen = (evt) => this.onOpen(evt);
    this.connection.onmessage = (evt) => this.onMessage(evt);
    this.connection.onerror = (evt) => this.onError(evt);
    this.connection.onclose = (evt) => this.onClose(evt);
  }

  onOpen(evt) {
    const wsgrid='0x01000000b201000064000a00a20100007b683a6e65675b2e7a2e775d3b703a747970655b785d3b245b703d39393b743a666c69702028606b65796076616c75652921286b657920783b76616c75652078293b702077697468696e20302032303b743a666c6970202860696e6465786076616c756529212874696c20636f756e7420783b78293b703d39383b743a783b272274797065206e6f7420737570706f72746564206279206772696420646973706c6179225d3b68202d3821283a3a3b286075692e7570646174655f7764723b2872617a65207b743a245b785b60745d3d226d223b602422737472696e67223b785b60745d3d2264223b6024226461746520737472696e67223b785b60745d20696e20226e757674223b6074696d653b785b60745d20696e2022707a223b606461746574696d653b785b60745d20696e202268696a6566223b606e756d6265723b60737472696e675d3b28656e6c69737420785b60635d292128656e6c6973742028656e6c697374206074797065292128656e6c697374207429297d656163682030216d65746120743b666c69702076616c756520666c697020742929293b685b5d7d';
    const wsclear='0x010000003a00000064000a002a0000007b683a6e65675b2e7a2e775d3b68202d3821283a3a3b2860636d2e636c6561723b282929293b685b5d7d';
    const wspub='0x01000000fa00000064000a00ea0000007b5b683b725d0a20633a73797374656d2263223b0a2069665b3130683d7479706520723b68202d3821283a3a3b2860636d2e646973703b28223d3e223b245b635b315d3c636f756e745b725d3b225c22222c2828635b315d2d34292372292c222e2e5c22223b725d2929293b3a685b5d5d3b0a20733a2e512e735b725d3b0a2069665b303d636f756e745b732065786365707420225c6e225d3b68202d3821283a3a3b2860636d2e646973703b28223d3e223b2d3321722929293b3a685b5d5d3b0a2068202d3821283a3a3b2860636d2e646973703b28223d3e223b2d315f732929293b3a685b5d0a7d';
    // placehoder for .ws.pub function, to be called by q server to publish data to client, e.g. for real-time updates without polling
    console.info("Connected, initializing");
    evt.currentTarget.send(this.serialize(".ws.grid:-9!"+wsgrid+";.ws.clear:-9!"+wsclear));    
  }

  onClose(evt) {
    alert("Disconnected, code " + evt.code);
  }

  onError(evt) {
    alert(evt.data);
  }

  onMessage(evt) {
    const msg = evt.data;
    if (msg) {
      const t = new Int8Array(msg.slice(0, 15));
      console.info("Deserializing type: " + t[8]);
      //this.buf0 = msg;
      this.buf = this.deserialize(msg);
      if (t[8] === 0 && t[14] === 101) {
        // msg in form (::;(function;args);(callback;args)), use :: as the magic byte to call js function
        if (this.buf.length === 2 || this.buf.length === 3) {
          // with or without callback
          let ret;
          if (Array.isArray(this.buf[1])) {
            if (this.buf[1].length !== 2) {
              console.error("'malformed JS function call, expect (`function;(args))");
              return;
            } else {
              try {ret=window.eval(this.buf[1][0]).apply(this,Array.isArray(this.buf[1][1])?this.buf[1][1]:[this.buf[1][1]]);} // do not return yet, proceed to callback
              catch (err) {console.error("'errors in js function:"+this.buf[1][0]);console.error(err);return;}
            }
          } else {
            try {ret=window.eval(this.buf[1][0])();} // do not return yet, proceed to callback
            catch (err) {console.error("'errors in js function:"+this.buf[1][0]);console.error(err);return;}
          }
          if (this.buf.length === 3) {
            // with callback
            let callback;
            if(Array.isArray(this.buf[2])) {
              if(this.buf[2].length!=2) {
                console.error("'malformed callback, expect (`callback;(args))");
                return;
              } else {
                try {
                  callback=this.buf[2];
                  this.send(this.serialize(callback.push(ret)));
                } catch (err) {
                  console.error("'errors in callback");
                  console.error(err);
                }
                return;
              }
            } else {
              try {
                callback=[this.buf[2]];
                this.send(this.serialize(callback.push(ret)));
              }  catch (err) {
                console.error("'errors in callback");
                console.error(err)
              }
            return;
            }
          }
                if(this.buf[1]==="::"||this.buf[1]==="::\n"){
                    if(this.cm) this.cm.setOpacity(1);
                    if(this.cm) this.cm.disp('=>',this.buf[1])
                } else {
                    try {window.eval(this.buf[1])}
                    catch (e) {console.error(e)}
                    }
                return;
            } else {
                if(this.buf.length!=2) {
                    if(this.cm) this.cm.setOpacity(1);
                    console.warn("Received unsupported type: " + t[8]);
                    return
                } else {
                    if(this.cm) this.cm.setOpacity(1);
                    if(this.cm) this.cm.disp('=>',this.buf[1]);
                }
            }
        } else {
            console.info("no data returned");
            return;
        }        
      }
    }

  send(data) {
    if (this.connection && this.connection.readyState === WebSocket.OPEN) {
      this.connection.send(data);
    } else {
      console.error("WebSocket is not open");
    }
  }

  deserialize(msg) {
    // Implement deserialization logic here
    return IPC.deserialize(msg);
  }

  serialize(data) {
    // Implement serialization logic here
    return IPC.serialize(data);
  }
}

export default QWebSocket;