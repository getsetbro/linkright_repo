export namespace main {
	
	export class AppStatus {
	    isRegistered: boolean;
	    isDefaultBrowser: boolean;
	    exePath: string;
	
	    static createFrom(source: any = {}) {
	        return new AppStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.isRegistered = source["isRegistered"];
	        this.isDefaultBrowser = source["isDefaultBrowser"];
	        this.exePath = source["exePath"];
	    }
	}
	export class BrowserProfile {
	    id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new BrowserProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	    }
	}
	export class Browser {
	    name: string;
	    path: string;
	    iconPath: string;
	    profiles: BrowserProfile[];
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new Browser(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.iconPath = source["iconPath"];
	        this.profiles = this.convertValues(source["profiles"], BrowserProfile);
	        this.type = source["type"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Condition {
	    field: string;
	    operator: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new Condition(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.field = source["field"];
	        this.operator = source["operator"];
	        this.value = source["value"];
	    }
	}
	export class PickerSettings {
	    showBrowserNames: boolean;
	    showURL: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PickerSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.showBrowserNames = source["showBrowserNames"];
	        this.showURL = source["showURL"];
	    }
	}
	export class Rule {
	    id: string;
	    name: string;
	    pattern: string;
	    matchType: string;
	    conditions: Condition[];
	    conditionLogic: string;
	    browser: string;
	    browserPath: string;
	    profile: string;
	    profileName: string;
	    priority: number;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Rule(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.pattern = source["pattern"];
	        this.matchType = source["matchType"];
	        this.conditions = this.convertValues(source["conditions"], Condition);
	        this.conditionLogic = source["conditionLogic"];
	        this.browser = source["browser"];
	        this.browserPath = source["browserPath"];
	        this.profile = source["profile"];
	        this.profileName = source["profileName"];
	        this.priority = source["priority"];
	        this.enabled = source["enabled"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Config {
	    defaultBrowser: string;
	    defaultProfile: string;
	    fallbackBehavior: string;
	    rules: Rule[];
	    firstRun: boolean;
	    pickerSettings: PickerSettings;
	    customBrowsers: Browser[];
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.defaultBrowser = source["defaultBrowser"];
	        this.defaultProfile = source["defaultProfile"];
	        this.fallbackBehavior = source["fallbackBehavior"];
	        this.rules = this.convertValues(source["rules"], Rule);
	        this.firstRun = source["firstRun"];
	        this.pickerSettings = this.convertValues(source["pickerSettings"], PickerSettings);
	        this.customBrowsers = this.convertValues(source["customBrowsers"], Browser);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PickerRequest {
	    url: string;
	    domain: string;
	    reason: string;
	    warning: string;
	    browsers: Browser[];
	
	    static createFrom(source: any = {}) {
	        return new PickerRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.domain = source["domain"];
	        this.reason = source["reason"];
	        this.warning = source["warning"];
	        this.browsers = this.convertValues(source["browsers"], Browser);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PickerResponse {
	    browserPath: string;
	    browserName: string;
	    profile: string;
	    profileName: string;
	    alwaysUse: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PickerResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.browserPath = source["browserPath"];
	        this.browserName = source["browserName"];
	        this.profile = source["profile"];
	        this.profileName = source["profileName"];
	        this.alwaysUse = source["alwaysUse"];
	    }
	}
	
	export class ProtocolApp {
	    scheme: string;
	    appName: string;
	    commandLine: string;
	    exePath: string;
	    isAvailable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ProtocolApp(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scheme = source["scheme"];
	        this.appName = source["appName"];
	        this.commandLine = source["commandLine"];
	        this.exePath = source["exePath"];
	        this.isAvailable = source["isAvailable"];
	    }
	}
	
	export class RuleValidation {
	    ruleId: string;
	    browserMissing: boolean;
	    profileMissing: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new RuleValidation(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ruleId = source["ruleId"];
	        this.browserMissing = source["browserMissing"];
	        this.profileMissing = source["profileMissing"];
	        this.message = source["message"];
	    }
	}

}

