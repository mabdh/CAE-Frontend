import {EventEmitter} from 'events';
import TraceModel from './TraceModel';
import {delayed} from "./Utils";
let _y;

function createRoomName(fileName) {
    return `CAE[${fileName}5]`;
}

function initSpace(fileName) {
    return new Y({db:{name:"memory"},connector:{
        name:"websockets-client",
        room: createRoomName(fileName),
        url: "http://192.168.2.101:1234"
    },
    sourceDir: './bower_components', // location of the y-* modules
    share:{'workspace':'Map'}, types : ['Text','Map']});
}

export default class workspace extends EventEmitter{
    constructor(contentProvider){
        super();
        this.contentProvider = contentProvider;
        this.timer = false;
        this.roomSynch = false;
    }
    
    isRoomSynchronized(){
        return this.roomSynch;
    }
    
    init(fileName,reload){
        let deferred = $.Deferred();
        this.roomSynch = false;
        initSpace(fileName).then( function(y){
            this.roomSynch = true;
            this.workspace = y.share.workspace;
            this.loadFile(fileName,reload).then( function(segmentValues,ySegmentArray,traceModel,reload,orders){
                deferred.resolve(segmentValues,ySegmentArray,traceModel,reload,orders);
            });
        }.bind(this));
        return deferred.promise();
    }
    
    getFile(fileName){
        let deferred = $.Deferred();
        if (fileName === "testFile") {
            this.contentProvider.getContent(fileName).then( function(model){
                let traceModel = new TraceModel(model);
                traceModel.parseModel();            
                deferred.resolve(traceModel);
            });
        }else{
            deferred.resolve([]);
        }
        
        return deferred.promise();
    }
    
    saveFile(filename,segmentManager){
       delayed.bind(this)(function(){
        console.log(segmentManager.getTraceModel().serializeModel());
        console.log(segmentManager.getTraceModel().getContent());
       }.bind(this),1000);
    }
    
    createYArrays(indexes,map,depth=0){
        let todos = [];
        let self = this;
        for(let i=0;i<indexes.length;i++){
            let index = indexes[i];
            if (typeof index.children != "undefined") {
                let subTodos = this.createYArrays(index.children,map,depth+1);
                todos = todos.concat(subTodos);
                todos.push(function(){
                    let deferred = $.Deferred();
                    self.createFileEntry("segmentOrder["+index.id+"]",Y.Array,map).then(function(arr){
                        deferred.resolve({id:index.id,list:arr});
                    });
                    return deferred.promise();                
                }());
            }
        }
        
        
        return todos;
    }
    
    loadFile(fileName,reload){
        let deferred = $.Deferred();
        let self = this;
        let arrays = [];
        let todos = [];
        this.createFileSpace(fileName,reload).then( function(map,cursor,ySegmentMap,ySegmentArray){
            self.setFileSpace(map,cursor,ySegmentMap,ySegmentArray);
            self.cursors = cursor;
            cursor.observe(self.cursorChangeHandler.bind(self));
            self.getFile(fileName).then( function(traceModel){
                todos = self.createYArrays(traceModel.getIndexes(),map);
                $.when.apply($,todos).then(function(){
                    deferred.resolve(ySegmentMap,ySegmentArray,traceModel,reload,Array.prototype.slice.call(arguments) );
                });
                
            });
        });
        return deferred.promise();
    }
    
    cursorChangeHandler(e){
        for(let o of e){
            let {name} = o;
            this.emit("cursorChange",name);
        }
    }
    
    createFileEntry(id,yObj,fileSpace){
        let deferred = $.Deferred();
        let promise = fileSpace.get(id);
        let self = this;
        if (promise === undefined) {
            fileSpace.set(id,yObj).then( function(obj){
                deferred.resolve(obj);
            });
        }else{
            promise.then(function(obj){
               deferred.resolve(obj); 
            });
        }
        return deferred;
    }
    
    createFileSpace(id,reload){
        let deferred = $.Deferred();
        let promise = this.workspace.get(id);
        let self = this;
        
        function fileSpaceInit(map){
            let todos = [];
            todos.push(self.createFileEntry("cursor",Y.Map,map));
            todos.push(self.createFileEntry("segmentValues",Y.Map,map));
            todos.push(self.createFileEntry("segmentOrder",Y.Array,map));
            $.when.apply($,todos).then(function(cursor,segmentValues,segmentOrder){
                deferred.resolve(map,cursor,segmentValues,segmentOrder);
            });
        }
        
        if (promise === undefined ) {
            self.workspace.set(id,Y.Map).then( fileSpaceInit );
        }else{
            if (reload) {
                promise.then( function(map){
                    //let keys = map.keys();
                    //for(let i=0;i<keys.length;i++){
                    //    console.log("delte "+keys[i]);
                    //    map.delete(keys[i]);
                    //}
                    
                    self.workspace.set(id,Y.Map).then( fileSpaceInit );
                });
                    
            }else{
                promise.then( fileSpaceInit );
            }
        }
        
        return deferred.promise();
        
    }
    
    setFileSpace(space){
        this.fileSpace = space;
    }
    
    getFileSpace(){
        return this.fileSpace;
    }
    
    setCursor(usrId,index){
       delayed.bind(this)(function(){
            this.cursors.set(usrId,index);
       }.bind(this),50);
    }
    
    getCursor(usrId){
        return this.cursors.get(usrId);
    }
    
    getRemoteCursors(){
        
        if (!this.cursors) {
            return [];
        }
        
        return this.cursors.keys().map(
            function (key) {
                return {usr:key,index:this.cursors.get(key)};
            }
        );
    }
    
    addSpaceChangeListener(listener){
        this.on("spaceChange" , listener);
    }
    
    removespaceChangeListener(listener){
        this.removeListener("spaceChange", listener);
    }
    
    
    addCursorChangeListener(listener){
        this.on("cursorChange" , listener);
    }
    
    removeCursorChangeListener(listener){
        this.removeListener("cursorChange", listener);
    }
}