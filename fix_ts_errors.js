const fs = require('fs');
const path = require('path');

const webappPath = path.join(__dirname, 'webapp');

function processFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // PatternMatchedEvent
    if (content.includes('getParameter(\'arguments\')') || content.includes('getParameter("arguments")')) {
        content = content.replace(/\(event as Event\)\.getParameter\('arguments'\)/g, '(event as Route$PatternMatchedEvent).getParameter(\'arguments\')');
        content = content.replace(/\(event as Event\)\.getParameter\("arguments"\)/g, '(event as Route$PatternMatchedEvent).getParameter("arguments")');
        
        if (!content.includes('Route$PatternMatchedEvent')) {
            content = "import type { Route$PatternMatchedEvent } from 'sap/ui/core/routing/Route';\n" + content;
        }
        // Remove old Event import if not used anymore
        if (!content.includes('(event as Event)') && content.includes("import Event from 'sap/ui/base/Event';")) {
            content = content.replace(/import Event from 'sap\/ui\/base\/Event';\n/, '');
        }
    }

    // ListBase$ItemPressEvent
    if (content.includes('getParameter(\'listItem\')') || content.includes('getParameter("listItem")')) {
        content = content.replace(/\(event as Event\)\.getParameter\('listItem'\)/g, '(event as ListBase$ItemPressEvent).getParameter(\'listItem\')');
        content = content.replace(/\(event as Event\)\.getParameter\("listItem"\)/g, '(event as ListBase$ItemPressEvent).getParameter("listItem")');
        
        if (!content.includes('ListBase$ItemPressEvent')) {
            content = "import type { ListBase$ItemPressEvent } from 'sap/m/ListBase';\n" + content;
        }
        // Remove old Event import if not used anymore
        if (!content.includes('(event as Event)') && content.includes("import Event from 'sap/ui/base/Event';")) {
            content = content.replace(/import Event from 'sap\/ui\/base\/Event';\n/, '');
        }
    }

    // Router$RouteMatchedEvent
    if (filePath.endsWith('MainShell.controller.ts')) {
        if (content.includes('getParameter(\'name\')')) {
            content = content.replace(/\(event as Event\)\.getParameter\('name'\)/g, '(event as Router$RouteMatchedEvent).getParameter(\'name\')');
            if (!content.includes('Router$RouteMatchedEvent')) {
                content = "import type { Router$RouteMatchedEvent } from 'sap/ui/core/routing/Router';\n" + content;
            }
        }
    }

    // TreeBinding for DetailCompare
    if (filePath.endsWith('DetailCompare.controller.ts')) {
        content = content.replace(/const binding = tree\.getBinding\('items'\);/g, "const binding = tree.getBinding('items') as TreeBinding;");
        if (content.includes('TreeBinding;') && !content.includes("import TreeBinding from 'sap/ui/model/TreeBinding';")) {
            content = "import TreeBinding from 'sap/ui/model/TreeBinding';\n" + content;
        }
    }

    // DetailService casts
    if (filePath.endsWith('DetailService.ts')) {
        content = content.replace(/as NodeTreeActionResult/g, 'as unknown as NodeTreeActionResult');
        content = content.replace(/as NodeDiffActionResult/g, 'as unknown as NodeDiffActionResult');
        content = content.replace(/\(item: Record<string, unknown>\) => NodeTreeResponseItem/g, '(item: unknown) => NodeTreeResponseItem');
        content = content.replace(/\(item: Record<string, unknown>\) => NodeDiffEntry/g, '(item: unknown) => NodeDiffEntry');
    }

    // VersionService casts
    if (filePath.endsWith('VersionService.ts')) {
        content = content.replace(/as VersionCompareActionResult/g, 'as unknown as VersionCompareActionResult');
    }

    // RegistryDetail tweaks
    if (filePath.endsWith('RegistryDetail.controller.ts')) {
        content = content.replace(/delete updatedFields\['@odata\.etag'\];/g, "delete (updatedFields as Record<string, unknown>)['@odata.etag'];");
        content = content.replace(/this\.registryService\.updateRegistry\(this\.registryId, updatedFields\)/g, "this.registryService.updateRegistry(this.registryId, updatedFields as ODataRecord)");
    }

    // ODataParsers
    if (filePath.endsWith('ODataParsers.ts')) {
        content = content.replace(/data\.results/g, '(data as { results: unknown[] }).results');
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
