//
//  Tangle.js
//  Tangle 0.0.1
//
//  Created by Bret Victor on 5/2/10.
//  (c) 2011 Bret Victor.  MIT open-source license.
//
//  ------ model ------
//
//  var tangle = new Tangle(rootElement, model);
//  tangle.setModel(model);
//
//  ------ variables ------
//
//  var value = tangle.getValue(variableName);
//  tangle.setValue(variableName, value);
//  tangle.setValues({ variableName:value, variableName:value });
//
//  ------ UI components ------
//
//  Tangle.classes.myClass = {
//     initialize: function (element, tangle, variable) { ... },
//     update: function (element, value) { ... }
//  };
//  Tangle.formats.myFormat = function (value) { return "..."; };
//

var Tangle = this.Tangle = function (rootElement, modelClass) {

    var tangle = this;
    tangle.element = rootElement;
    tangle.setModel = setModel;
    tangle.getValue = getValue;
    tangle.setValue = setValue;
    tangle.setValues = setValues;

    var _model;
    var _settersByVariableName = {};
    var _varargConstructorsByArgCount = [];


    //----------------------------------------------------------
    //
    // construct

    initializeElements();
    setModel(modelClass);
    return tangle;


    //----------------------------------------------------------
    //
    // elements

    function initializeElements() {
        var elements = rootElement.getElementsByTagName("*");
        var interestingElements = [];
        
        // build a list of elements with class or data-var attributes
        
        for (var i = 0, length = elements.length; i < length; i++) {
            var element = elements[i];
            if (element.getAttribute("class") || element.getAttribute("data-var")) {
                interestingElements.push(element);
            }
        }

        // initialize interesting elements in this list.  (Can't traverse "elements"
        // directly, because "elements" is "live", and views that change the node tree
        // will change "elements" mid-traversal.)
        
        for (var i = 0, length = interestingElements.length; i < length; i++) {
            var element = interestingElements[i];
            
            var varNames = null;
            var varAttribute = element.getAttribute("data-var");
            if (varAttribute) { varNames = varAttribute.split(" "); }

            var views = null;
            var classAttribute = element.getAttribute("class");
            if (classAttribute) {
                var classNames = classAttribute.split(" ");
                views = getViewsForElement(element, classNames, varNames);
            }
            
            if (!varNames) { continue; }
            
            var didAddSetter = false;
            if (views) {
                for (var j = 0; j < views.length; j++) {
                    if (!views[j].update) { continue; }
                    addViewSettersForElement(element, varNames, views[j]);
                    didAddSetter = true;
                }
            }
            
            if (!didAddSetter) {
                var formatAttribute = element.getAttribute("data-format");
                var formatter = getFormatter(formatAttribute || "default");
                addDefaultSettersForElement(element, varNames, formatter);
            }
        }
    }
            
    function getViewsForElement(element, classNames, varNames) {
        var views = null;
        
        for (var i = 0, length = classNames.length; i < length; i++) {
            var clas = Tangle.classes[classNames[i]];
            if (!clas) { continue; }
            
            var args = [ element, tangle ];
            if (varNames) { args = args.concat(varNames); }
            
            var view = constructClass(clas, args);
            
            if (!views) { views = []; }
            views.push(view);
        }
        
        return views;
    }
    
    function constructClass(clas, args) {
        if (typeof clas !== "function") {  // class is prototype object
            var View = function () { };
            View.prototype = clas;
            var view = new View();
            if (view.initialize) { view.initialize.apply(view,args); }
            return view;
        }
        else {  // class is constructor function, which we need to "new" with varargs (but no built-in way to do so)
            var ctor = _varargConstructorsByArgCount[args.length];
            if (!ctor) {
                var ctorArgs = [];
                for (var i = 0; i < args.length; i++) { ctorArgs.push("args[" + i + "]"); }
                var ctorString = "(function (clas,args) { return new clas(" + ctorArgs.join(",") + "); })";
                ctor = eval(ctorString);   // nasty
                _varargConstructorsByArgCount[args.length] = ctor;   // but cached
            }
            return ctor(clas,args);
        }
    }
    

    //----------------------------------------------------------
    //
    // formatters

    function getFormatter(formatAttribute) {
        var formatter = Tangle.formats[formatAttribute] || getSprintfFormatter(formatAttribute);
        if (!formatter) { 
            log("Tangle: unknown format: " + formatAttribute);
            formatter = Tangle.formats["default"];
        }
        return formatter;
    }
    
    function getSprintfFormatter(formatAttribute) {
        if (!sprintf || !formatAttribute.test(/\%/)) { return null; }
        var formatter = function (value) { return sprintf(formatAttribute, value); };
        return formatter;
    }

    
    //----------------------------------------------------------
    //
    // setters

    function addViewSettersForElement(element, varNames, view) {
        var setter;
        if (varNames.length === 1) {
            setter = function (value) { view.update(element, value); };
        }
        else {
            setter = function () {
                var args = [ element ];
                for (var i = 0, length = varNames.length; i < length; i++) { args.push(getValue(varNames[i])); }
                view.update.apply(view,args);
            };
        }

        for (var i = 0; i < varNames.length; i++) {
            addSetterForVariable(varNames[i], setter);  // TODO: if 2 varNames, and both variables change, this is called twice
        }
    }

    function addDefaultSettersForElement(element, varNames, formatter) {
        var span = null;
        var setter = function (value) {
            if (!span) { 
                span = document.createElement("span");
                element.insertBefore(span, element.firstChild);
            }
            span.innerHTML = formatter(value);
        };
        addSetterForVariable(varNames[0], setter);
    }
    
    function addSetterForVariable(varName, setter) {
        if (!_settersByVariableName[varName]) { _settersByVariableName[varName] = []; }
        _settersByVariableName[varName].push(setter);
    }

    function applySettersForVariable(varName, value) {
        var setters = _settersByVariableName[varName];
        if (!setters) { return; }
        for (var i = 0, length = setters.length; i < length; i++) {
            setters[i](value);
        }
    }
    

    //----------------------------------------------------------
    //
    // variables

    function getValue(varName) {
        var value = _model[varName];
        if (value === undefined) { log("Tangle: unknown variable: " + varName);  return 0; }
        return value;
    }

    function setValue(varName, value) {
        var obj = {}
        obj[varName] = value;
        setValues(obj);
    }

    function setValues(obj) {
        var didChangeValue = false;

        for (var varName in obj) {
            var value = obj[varName];
            var oldValue = _model[varName];
            if (oldValue === undefined) { log("Tangle: setting unknown variable: " + varName);  return; }
            if (oldValue === value) { continue; }  // don't update if new value is the same

            _model[varName] = value;
            applySettersForVariable(varName, value);
            didChangeValue = true;
        }
        
        if (didChangeValue) { updateModel(); }
    }
    
                    
    //----------------------------------------------------------
    //
    // model

    function setModel(modelClass) {
        var ModelClass = function () { };
        ModelClass.prototype = modelClass;
        _model = new ModelClass;

        updateModel(true);  // initialize and update
    }
    
    function updateModel(shouldInitialize) {
        var ShadowModel = function () {};
        ShadowModel.prototype = _model;
        var shadowModel = new ShadowModel;
        
        if (shouldInitialize) { shadowModel.initialize(); }
        shadowModel.update();
        
        var changedVarNames = [];
        for (var varName in shadowModel) {
            if (_model[varName] !== shadowModel[varName]) {
                _model[varName] = shadowModel[varName];
                changedVarNames.push(varName);
            }
        }
        
        for (var i = 0, length = changedVarNames.length; i < length; i++) {
            var varName = changedVarNames[i];
            applySettersForVariable(varName, _model[varName]);
        }
    }


    //----------------------------------------------------------
    //
    // debug

    function log (msg) {
        if (window.console) window.console.log(msg);
    }

};  // end of Tangle


//----------------------------------------------------------
//
// components

Tangle.classes = {};
Tangle.formats = {};

Tangle.formats["default"] = function (value) { return "" + value; }

