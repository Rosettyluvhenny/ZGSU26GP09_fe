const fs = require('fs');
const path = require('path');

function replaceAnyInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Fix event as any
    content = content.replace(/\(event as any\)/g, '(event as sap.ui.base.Event)');
    
    // Fix table as any
    content = content.replace(/\(table as any\)/g, '(table as unknown as { getGrowingInfo?: () => any, _oGrowingDelegate?: any })');

    // Fix node as any
    content = content.replace(/\(node as any\)\.shouldExpand/g, '(node as unknown as { shouldExpand: boolean }).shouldExpand');

    // Fix tree as any
    content = content.replace(/this\.byId\(treeId\) as any/g, 'this.byId(treeId) as sap.ui.table.TreeTable');

    // Fix MainShell
    if (filePath.includes('MainShell.controller.ts')) {
        content = content.replace(/event: any/g, 'event: sap.ui.base.Event');
        content = content.replace(/getData\(\) as any/g, 'getData() as { authenticated?: boolean }');
    }

    if (filePath.includes('RegistryDetail.controller.ts')) {
        content = content.replace(/getParameter\('listItem'\) as any/g, 'getParameter(\'listItem\') as sap.m.ListItemBase');
    }
    
    if (filePath.includes('ODataParsers.ts')) {
        content = content.replace(/Record<string, any>/g, 'Record<string, unknown>');
        content = content.replace(/as any/g, 'as unknown as Record<string, unknown>');
        content = content.replace(/this as any/g, 'this as unknown');
    }
    
    if (filePath.includes('DetailService.ts')) {
        content = content.replace(/Record<string, any>/g, 'Record<string, unknown>');
        content = content.replace(/Promise<any\[\]>/g, 'Promise<unknown[]>');
    }

    if (filePath.includes('RegistryService.ts')) {
        content = content.replace(/Promise<any>/g, 'Promise<unknown>');
        content = content.replace(/\(error as any\)/g, '(error as { value?: string })');
    }

    if (filePath.includes('VersionService.ts')) {
        content = content.replace(/Record<string, any>/g, 'Record<string, unknown>');
    }

    // Fix import for sap.ui.base.Event if missing and needed
    if (content.includes('sap.ui.base.Event') && !content.includes("import Event from 'sap/ui/base/Event'")) {
        content = content.replace(/sap\.ui\.base\.Event/g, 'Event');
        if (!content.includes("import Event from")) {
            content = "import Event from 'sap/ui/base/Event';\n" + content;
        }
    }
    
    // Fix TreeTable import if missing and needed
    if (content.includes('sap.ui.table.TreeTable') && !content.includes("import TreeTable from 'sap/ui/table/TreeTable'")) {
        content = content.replace(/sap\.ui\.table\.TreeTable/g, 'TreeTable');
        if (!content.includes("import TreeTable from")) {
            content = "import TreeTable from 'sap/ui/table/TreeTable';\n" + content;
        }
    }
    
    // Fix sap.m.ListItemBase
    if (content.includes('sap.m.ListItemBase') && !content.includes("import ListItemBase from 'sap/m/ListItemBase'")) {
        content = content.replace(/sap\.m\.ListItemBase/g, 'ListItemBase');
        if (!content.includes("import ListItemBase from")) {
            content = "import ListItemBase from 'sap/m/ListItemBase';\n" + content;
        }
    }

    fs.writeFileSync(filePath, content, 'utf8');
}

const dirs = [
    path.join(__dirname, 'webapp', 'controller'),
    path.join(__dirname, 'webapp', 'services')
];

dirs.forEach(dir => {
    fs.readdirSync(dir).forEach(file => {
        if (file.endsWith('.ts')) {
            replaceAnyInFile(path.join(dir, file));
        }
    });
});
