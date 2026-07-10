const fs = require('fs');
const path = require('path');

const webappPath = path.join(__dirname, 'webapp');

function processFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    
    // Add missing Router$PatternMatchedEvent import
    if (content.includes('Route$PatternMatchedEvent') && !content.includes("import type { Route$PatternMatchedEvent }")) {
        content = "import type { Route$PatternMatchedEvent } from 'sap/ui/core/routing/Route';\n" + content;
    }
    
    // Add missing ListBase$ItemPressEvent import
    if (content.includes('ListBase$ItemPressEvent') && !content.includes("import type { ListBase$ItemPressEvent }")) {
        content = "import type { ListBase$ItemPressEvent } from 'sap/m/ListBase';\n" + content;
    }

    // Fix TreeBinding in DetailCompare
    if (filePath.endsWith('DetailCompare.controller.ts')) {
        // we already added TreeBinding import in previous script, now we need to define an interface
        if (!content.includes('interface ExtendedTreeBinding')) {
            const interfaceStr = `\ninterface ExtendedTreeBinding {
	expand(index: number): void;
	getLength(): number;
	getContextByIndex(index: number): { getObject: () => NodeTreeViewItem } | undefined;
	isExpanded(index: number): boolean;
}\n`;
            content = content.replace("import BaseController from './BaseController';", "import BaseController from './BaseController';" + interfaceStr);
        }
        
        content = content.replace(/as TreeBinding/g, 'as unknown as ExtendedTreeBinding');
        content = content.replace(/tree\.getBinding\('items'\);/g, "tree.getBinding('items') as unknown as ExtendedTreeBinding;");
    }

    // DetailService casts
    if (filePath.endsWith('DetailService.ts')) {
        content = content.replace(/\(item: unknown\) => NodeTreeResponseItem/g, '(item: any) => NodeTreeResponseItem');
        content = content.replace(/\(item: unknown\) => NodeDiffEntry/g, '(item: any) => NodeDiffEntry');
        // Actually, the error was: Argument of type '(item: Record<string, unknown>) => NodeTreeResponseItem' is not assignable to parameter of type '(value: NodeTreeResponseItem, index: number, array: NodeTreeResponseItem[]) => NodeTreeResponseItem'.
        // This means it was mapping over an array of NodeTreeResponseItem.
        content = content.replace(/\(item: any\) => NodeTreeResponseItem/g, '(item: NodeTreeResponseItem) => NodeTreeResponseItem');
        content = content.replace(/\(item: any\) => NodeDiffEntry/g, '(item: NodeDiffEntry) => NodeDiffEntry');
        // Let's replace the previous `unknown` replace which broke it.
        content = content.replace(/\(item: Record<string, unknown>\) => NodeTreeResponseItem/g, '(item: NodeTreeResponseItem) => NodeTreeResponseItem');
        content = content.replace(/\(item: Record<string, unknown>\) => NodeDiffEntry/g, '(item: NodeDiffEntry) => NodeDiffEntry');
    }
    
    // ODataParsers
    if (filePath.endsWith('ODataParsers.ts')) {
        content = content.replace(/data\.results/g, '(data as { results: unknown[] }).results');
    }
    
    // RegistryList.controller.ts imports
    if (filePath.endsWith('RegistryList.controller.ts')) {
        if (!content.includes("import ViewSettingsDialog from 'sap/m/ViewSettingsDialog'")) {
            content = "import ViewSettingsDialog from 'sap/m/ViewSettingsDialog';\n" + content;
        }
        if (!content.includes("import ViewSettingsItem from 'sap/m/ViewSettingsItem'")) {
            content = "import ViewSettingsItem from 'sap/m/ViewSettingsItem';\n" + content;
        }
        if (!content.includes("import Table from 'sap/m/Table'")) {
            content = "import Table from 'sap/m/Table';\n" + content;
        }
        if (!content.includes("import ListBinding from 'sap/ui/model/ListBinding'")) {
            content = "import ListBinding from 'sap/ui/model/ListBinding';\n" + content;
        }
    }
    
    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

function walkSync(dir, callback) {
    fs.readdirSync(dir).forEach(file => {
        const filepath = path.join(dir, file);
        if (fs.statSync(filepath).isDirectory()) {
            walkSync(filepath, callback);
        } else if (filepath.endsWith('.ts')) {
            callback(filepath);
        }
    });
}

walkSync(webappPath, processFile);
