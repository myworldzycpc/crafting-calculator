window.activeSearchResult = null;
window.activeSearchResultIndex = null;
window.searchResult = [];
window.order = [];
window.count = {};
window.times = {};
window.basicCount = {};
window.remainings = {};
window.alreadyHave = {};
window.inferences = [];
window.currentShowing = [];
window.multiItemMode = false;
window.basicCountOrder = [];
window.showedInference = true;
window.patchedRecipes = {};
window.persistentCurrentItems = [];
window.currentShowingStep = null;
window.longTransitionTimeout = null;

function escapeHtml(str) {
    return String(str).replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    }).replace(/["']/g, function (m) {
        if (m === '"') return '&quot;';
        if (m === "'") return '&#39;';
        return m;
    });
}

const STORAGE_KEY = 'crafting-calculator-state';
const SETTINGS_KEY = 'crafting-calculator-settings';
window.autoCalculateTimer = null;

function saveSettings() {
    const settings = {
        hoverHighlight: $("#setting-hover-highlight").is(":checked"),
        autoCalculateDelay: $("#setting-auto-calculate").val(),
        expandConfirm: $("#setting-expand-confirm").is(":checked"),
        modalEsc: $("#setting-modal-esc").is(":checked"),
        modalBackdrop: $("#setting-modal-backdrop").is(":checked"),
        showDetailColumn: $("#setting-show-detail-column").is(":checked"),
        showGeneratedMap: $("#setting-show-generated-map").is(":checked"),
        missingno: $("#setting-missingno").is(":checked"),
        minecraftUi: $("#setting-minecraft-ui").is(":checked"),
    };
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('保存设置失败:', e);
    }
}

function loadSettings() {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (!saved) return null;
        return JSON.parse(saved);
    } catch (e) {
        console.error('加载设置失败:', e);
        return null;
    }
}

function applySettings(settings) {
    if (!settings) return;
    if (settings.hoverHighlight !== undefined) {
        $("#setting-hover-highlight").prop("checked", settings.hoverHighlight);
    }
    if (settings.autoCalculateDelay !== undefined) {
        $("#setting-auto-calculate").val(settings.autoCalculateDelay);
    }
    if (settings.expandConfirm !== undefined) {
        $("#setting-expand-confirm").prop("checked", settings.expandConfirm);
    }
    if (settings.modalEsc !== undefined) {
        $("#setting-modal-esc").prop("checked", settings.modalEsc);
    }
    if (settings.modalBackdrop !== undefined) {
        $("#setting-modal-backdrop").prop("checked", settings.modalBackdrop);
    }
    if (settings.showDetailColumn !== undefined) {
        $("#setting-show-detail-column").prop("checked", settings.showDetailColumn);
    }
    if (settings.showGeneratedMap !== undefined) {
        $("#setting-show-generated-map").prop("checked", settings.showGeneratedMap);
    }
    if (settings.missingno !== undefined) {
        $("#setting-missingno").prop("checked", settings.missingno);
    }
    if (settings.minecraftUi !== undefined) {
        $("#setting-minecraft-ui").prop("checked", settings.minecraftUi);
    }
}

const PATCHES_KEY = 'crafting-calculator-patches';
window.recipePatches = [];
window.dirtyRecipePatches = [];

function savePatches() {
    try {
        localStorage.setItem(PATCHES_KEY, JSON.stringify(window.recipePatches));
    } catch (e) {
        console.error('保存补丁失败:', e);
    }
}

function loadPatches() {
    try {
        const saved = localStorage.getItem(PATCHES_KEY);
        if (!saved) return [];
        return JSON.parse(saved);
    } catch (e) {
        console.error('加载补丁失败:', e);
        return [];
    }
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function getEffectiveRecipes(patches) {
    const effectiveRecipes = deepClone(window.defaultRecipes);
    for (const patch of patches) {
        if (!patch.enabled) continue;
        for (const key in patch.data) {
            if (patch.data[key] === null) {
                delete effectiveRecipes[key];
            } else {
                effectiveRecipes[key] = deepClone(patch.data[key]);
            }
        }
    }
    return effectiveRecipes;
}

function getPatchedRecipes(patches) {
    const patchedRecipes = {};
    for (const patch of patches) {
        if (!patch.enabled) continue;
        for (const key in patch.data) {
            patchedRecipes[key] = patch.name;
        }
    }
    return patchedRecipes;
}

function detectCycles(recipesData, patches) {
    if (!patches) {
        patches = window.dirtyRecipePatches;
    }
    const visited = {};
    const recStack = [];
    const cycleNodes = [];
    const patchInfo = {};

    for (const key in recipesData) {
        patchInfo[key] = null;
    }
    for (let i = 0; i < patches.length; i++) {
        const patch = patches[i];
        if (!patch.enabled) continue;
        for (const key in patch.data) {
            if (patch.data[key] !== null) {
                patchInfo[key] = patch.name;
            }
        }
    }

    function dfs(node) {
        visited[node] = true;
        recStack.push(node);

        const recipe = recipesData[node];
        if (recipe && recipe.ingredients) {
            for (const ingredient of recipe.ingredients) {
                const ingredientKey = ingredient[0];
                if (recipesData[ingredientKey]) {
                    const index = recStack.lastIndexOf(ingredientKey);
                    if (index !== -1) {
                        for (const key of recStack.slice(index)) {
                            cycleNodes.push(key);
                        }
                        return true;
                    } else if (!visited[ingredientKey]) {
                        if (dfs(ingredientKey)) return true;
                    }
                }
            }
        }

        recStack.pop();
        return false;
    }

    for (const key in recipesData) {
        if (!visited[key]) {
            if (dfs(key)) break;
        }
    }

    if (cycleNodes.length === 0) {
        return {hasCycle: false, cycleNodes: [], patchInfo: {}};
    }

    const cycleNodesArray = cycleNodes.map(node => ({
        key: node,
        patch: patchInfo[node]
    }));

    return {hasCycle: true, cycleNodes: cycleNodesArray, patchInfo};
}

function setRecipes(recipesData) {
    recipes = recipesData;
    for (const key in recipes) {
        const value = recipes[key];
        if (!("map" in value)) {
            let columns;
            if (value.ingredients.length <= 9) {
                columns = 3;
            } else {
                columns = Math.ceil(Math.sqrt(value.ingredients.length));
            }
            // 每columns个ingredient一组，转换成map
            const map = [];
            for (let i = 0; i < value.ingredients.length; i += columns) {
                const group = value.ingredients.slice(i, i + columns);
                const row = [];
                for (let j = 0; j < group.length; j++) {
                    const item = group[j][0];
                    row.push(item);
                }
                map.push(row);
            }
            value.map = map;
            value.isGeneratedMap = true;
        }
    }
}

function applyPatchesWithValidation(patches) {
    if (!patches) {
        patches = dirtyRecipePatches;
    }
    const effectiveRecipes = getEffectiveRecipes(patches);
    const cycleResult = detectCycles(effectiveRecipes, patches);

    if (cycleResult.hasCycle) {
        const cycleKeys = cycleResult.cycleNodes.map(n => n.key).concat([cycleResult.cycleNodes[0].key]).join(' → ');
        const patchNames = [...new Set(cycleResult.cycleNodes.map(n => n.patch || '默认'))].join(', ');
        return {
            success: false,
            error: `检测到循环依赖！涉及的配方：${cycleKeys}。这些配方由以下补丁修改：${patchNames}`
        };
    }

    window.recipePatches = deepClone(patches);
    window.patchedRecipes = getPatchedRecipes(patches);
    setRecipes(effectiveRecipes);
    return {success: true};
}

function saveState() {
    const state = {
        multiItemMode: window.multiItemMode,
        singleItemInput: $("#input-item").val(),
        multiItemList: [],
        alreadyHaveList: []
    };

    $("#item-target-list").find("tr").each(function () {
        const $tr = $(this);
        const item = $tr.find('input[name=key]').val().trim();
        const count = $tr.find('input[name=count]').val().trim();
        if (item || count) {
            state.multiItemList.push({key: item, count: count || '1'});
        }
    });

    $("#item-already-have").find("tr").each(function () {
        const $tr = $(this);
        const item = $tr.find('input[name=key]').val().trim();
        const count = $tr.find('input[name=count]').val().trim();
        if (item || count) {
            state.alreadyHaveList.push({key: item, count: count || '-1'});
        }
    });

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('保存状态失败:', e);
    }
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return null;
        return JSON.parse(saved);
    } catch (e) {
        console.error('加载状态失败:', e);
        return null;
    }
}

function applyState(state) {
    if (!state) return;

    if (state.multiItemMode !== undefined) {
        window.multiItemMode = state.multiItemMode;
        $("#input-item-select").val(state.multiItemMode ? "multi" : "single").trigger('change');
    }

    if (state.singleItemInput) {
        $("#input-item").val(state.singleItemInput);
    }

    if (state.multiItemList && state.multiItemList.length > 0) {
        const $tbody = $("#item-target-list");
        $tbody.empty();
        for (const item of state.multiItemList) {
            const key = item.key || '';
            const count = item.count || '1';
            const escapedKey = escapeHtml(key);
            const escapedCount = escapeHtml(count);
            const $tr = $(`
                <tr>
                    <td>${renderItem(key, -1)}</td>
                    <td><input type="text" class="form-control in-computation-process" name="key" list="item-list" value="${escapedKey}"></td>
                    <td><input type="text" class="form-control in-computation-process" name="count" oninput="checkNumber(this)" value="${escapedCount}"></td>
                    <td><button class="btn btn-danger" data-action="delete">删除</button></td>
                </tr>
            `);
            $tbody.append($tr);
            if (key && recipes[key]) {
                $tr.find('input[name=key]').removeClass('has-error');
            }
        }
    }

    if (state.alreadyHaveList && state.alreadyHaveList.length > 0) {
        const $table = $("#item-already-have");
        for (const item of state.alreadyHaveList) {
            const key = item.key || '';
            const count = item.count || '-1';
            const escapedKey = escapeHtml(key);
            const escapedCount = escapeHtml(count === '-1' ? '' : count);
            const $tr = $(`
                <tr>
                    <td>${renderItem(key, -1)}</td>
                    <td><input type="text" class="form-control in-computation-process" name="key" list="item-list" value="${escapedKey}"></td>
                    <td><input type="text" class="form-control in-computation-process" name="count" oninput="checkNumber(this)" value="${escapedCount}"></td>
                    <td><button class="btn btn-danger" data-action="delete">删除</button></td>
                </tr>
            `);
            $table.append($tr);
            if (key) {
                if (recipes[key]) {
                    $tr.find('input[name=key]').removeClass('has-error').removeClass('has-warning');
                } else if (items[key]?.icon) {
                    $tr.find('input[name=key]').addClass('has-warning').removeClass('has-error');
                } else {
                    $tr.find('input[name=key]').addClass('has-error').removeClass('has-warning');
                }
            }
        }
    }
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const debouncedSaveState = debounce(saveState, 300);

/**
 * 从recipes对象的键中搜索keyword并返回列表
 *
 * @param keyword
 * @returns {string[]}
 */
function searchItem(keyword) {

    // const result = [];
    // for (const key in recipes) {
    //     if (recipes.hasOwnProperty(key)) {
    //         if (key.indexOf(keyword) >= 0) {
    //             result.push(key);
    //         }
    //     }
    // }

    // 开头匹配优先
    let startBy = Object.keys(recipes).filter(key => key.startsWith(keyword));
    // 按先长度后字母排序
    startBy.sort((a, b) => a.length - b.length || a.localeCompare(b));

    // 包含匹配其次（不包括startBy）
    let contains = Object.keys(recipes).filter(key => key.indexOf(keyword) >= 0 && startBy.indexOf(key) < 0);
    // 按先长度后字母排序
    contains.sort((a, b) => a.length - b.length || a.localeCompare(b));

    window.searchResult = startBy.concat(contains);
    return window.searchResult;
}

function showResult(result) {
    const $result = $('#search-result');
    /**
     * @type {*|HTMLElement|jQuery}
     */
    const $results_table = $result.find('table');
    $results_table.empty();
    for (let i = 0; i < result.length; i++) {
        const key = result[i];
        const escapedKey = escapeHtml(key);
        const $tr = $(`<tr class="search-result-item"><td>${renderItem(key, -1)}</td><td><div class="search-result-key">${escapedKey}</div></td></tr>`);
        $tr.data('key', key);
        $results_table.append($tr);
    }
    $result.show();
    setActiveSearchResult($results_table.find('tr:first-child'));
}

function setActiveSearchResult($active) {
    $("#search-result table tr").removeClass("active");
    if (!$active || $active.length === 0) {
        window.activeSearchResult = null;
        window.activeSearchResultIndex = null;
        console.log("setActiveSearchResult: $active is null");
        return;
    }
    // 如果$active是tr
    if ($active.is('tr')) {
        window.activeSearchResult = $active.data('key');
        window.activeSearchResultIndex = window.searchResult.indexOf(window.activeSearchResult);
        $active.addClass("active");
        console.log(`setActiveSearchResult: set active to ${window.activeSearchResult} at index ${window.activeSearchResultIndex}`);
    } else {
        console.error("setActiveSearchResult: $active is not a tr element");
    }
}

function addBasicCount(key, count) {
    if (basicCount[key]) {
        basicCount[key] += count;
    } else {
        basicCount[key] = count;
    }
}

function addRemaining(key, count) {
    if (remainings[key]) {
        remainings[key] += count;
    } else {
        remainings[key] = count;
    }
}

function addCount(key, count) {
    if (order.indexOf(key) === -1) {
        order.push(key);
        window.count[key] = count;
    } else {
        window.count[key] += count;
    }
}

function addTimes(key, times) {
    if (window.times[key]) {
        window.times[key] += times;
    } else {
        window.times[key] = times;
    }
}

function calculate(key, count, depth) {
    if (count <= 0) {
        return;
    }
    if (recipes[key]) {
        const recipeCount = recipes[key].count || 1;
        let times = Math.ceil(count / recipeCount);
        const realCount = times * recipeCount;
        const remaining = realCount - count;
        // console.log(`${' '.repeat(depth)} 合成 ${key} x ${count} 需要 ${recipes[key].ingredients.map(i => `${i[0]} x ${i[1] ? i[1] * count : count}`).join(' + ')}`);
        // 记录推理 {type: 合成类型, depth: 推理深度, key: 合成物, count: 数量, ingredients: [{key: 原料, count: 数量}]}
        window.inferences.push({
            type: recipes[key].type,
            depth,
            key,
            realCount,
            ingredients: recipes[key].ingredients.map(i => ({key: i[0], count: i[1] ? i[1] * count : count}))
        });
        for (const ingredient of recipes[key].ingredients) {
            let count1 = ingredient[1] ? ingredient[1] * times : times;

            if (window.alreadyHave[ingredient[0]]) {
                const alreadyHaveCount = window.alreadyHave[ingredient[0]];
                if (alreadyHaveCount === -1) {
                    // 不限制
                    addBasicCount(ingredient[0], count1);
                    count1 = 0;
                } else if (alreadyHaveCount < count1) {
                    addBasicCount(ingredient[0], alreadyHaveCount);
                    delete window.alreadyHave[ingredient[0]];
                    count1 -= alreadyHaveCount;
                } else if (alreadyHaveCount > count1) {
                    addBasicCount(ingredient[0], count1);
                    window.alreadyHave[ingredient[0]] -= count1;
                    count1 = 0;
                } else {
                    addBasicCount(ingredient[0], count1);
                    delete window.alreadyHave[ingredient[0]];
                    count1 = 0;
                }
            }
            if (window.remainings[ingredient[0]]) {
                const remainingCount = window.remainings[ingredient[0]];
                if (remainingCount === -1) {
                    // 不限制
                    count1 = 0;
                } else if (remainingCount < count1) {
                    delete window.remainings[ingredient[0]];
                    count1 -= remainingCount;
                } else if (remainingCount > count1) {
                    window.remainings[ingredient[0]] -= count1;
                    count1 = 0;
                } else {
                    delete window.remainings[ingredient[0]];
                    count1 = 0;
                }
            }
            calculate(ingredient[0], count1, depth + 1);
        }
        addCount(key, realCount);
        addTimes(key, times);
        if (remaining > 0) {
            addRemaining(key, remaining);
        }
    } else {
        addBasicCount(key, count);
    }
}

function updateInput() {
    doSearch();
    // if (key.length > 0) {
    //     showRecipe(key);
    // }
}

/**
 * 渲染物品矩阵
 */
function renderMap(key) {
    const map = recipes[key].map;
    return `
    <table class="item-matrix">
        ${map.map(row => `
            <tr>
                ${row.map(item => `
                    <td>${renderItem(item, -1)}</td>
                `).join('')}
            </tr>
        `).join('')}
    </table>
    `;
}

function readItemList() {
    let itemList = [];
    if (!window.multiItemMode) {
        const key = $("#input-item").val().trim();
        if (key) {
            itemList = [[key, 1]];
        }
    } else {
        $("#item-target-list").find("tr").each(function () {
            const $tr = $(this);
            const item = $tr.find('input[name=key]').val().trim();
            const count = $tr.find('input[name=count]').val().trim();
            if (item && count && parseInt(count) > 0) {
                itemList.push([item, parseInt(count)]);
            }
        });
    }
    window.currentShowing = itemList;
}

function showRecipe() {
    const $calculationAlert = $("#calculation-alert");
    $calculationAlert.hide();
    $("#step-detail-modal").modal("hide");
    if (window.currentShowing.length === 0) {
        return;
    }
    readAlreadyHave();
    for (const item of window.currentShowing) {
        const key = item[0];
        if (!recipes[key]) {
            $calculationAlert.text(`找不到配方 ${key}`).show();
            return;
        }
        if (window.alreadyHave[key]) {
            $calculationAlert.text(`已经拥有 ${key}`).show();
            return;
        }
    }
    window.order = [];
    window.count = {};
    window.basicCount = {};
    window.inferences = [];
    window.showedInference = false;
    $("#inference-panel,#adjust-order").empty();
    window.remainings = {};
    window.times = {};
    console.log(`合成 ${window.currentShowing.map(i => i[0] + 'x' + i[1]).join(' + ')}`);
    for (const item of window.currentShowing) {
        const key = item[0];
        const count = item[1];
        calculate(key, count, 0);
    }
    toShowInference();
    console.log(basicCount);
    // 开始计时
    const startTime = new Date().getTime();
    // 检查不会出现在合成前使用的情况
    let continueFlag = true;
    let adjustOrderHtml = '<ul>';
    while (continueFlag) {
        continueFlag = false;
        // 超时退出
        if (new Date().getTime() - startTime > 3000) {
            $calculationAlert.text('计算超时，请检查输入').show();
            return;
        }
        const currentItems = {...basicCount};
        for (const item of order) {
            for (const ingredient of recipes[item].ingredients) {
                const key = ingredient[0];
                const realCount = ingredient[1] ? ingredient[1] * times[item] : times[item];
                if (realCount > (currentItems[key] || 0)) {
                    // 把order中的key放到item前面
                    const index = order.indexOf(key);
                    if (index < 0) {
                        $calculationAlert.text(`找不到 ${key} 在order中的位置`).show();
                        return;
                    }
                    order.splice(index, 1);
                    order.splice(order.indexOf(item), 0, key);
                    console.log(`调整顺序: ${key} => ${item}`);
                    adjustOrderHtml += `<li>调整顺序: ${renderItem(key, count[key])}<span class="arrow">→</span>${renderItem(item, count[item])}</li>`;
                    continueFlag = true;
                    break;
                }
                currentItems[key] -= realCount;
            }
            if (continueFlag) {
                break;
            }
            if (currentItems[item]) {
                currentItems[item] += count[item];
            } else {
                currentItems[item] = count[item];
            }
        }
    }
    adjustOrderHtml += '</ul>';
    $("#adjust-order").html(adjustOrderHtml);
    let orderHtml = '';
    window.persistentCurrentItems = [];
    const currentItems = deepClone(basicCount);
    for (const [i, item] of order.entries()) {
        for (const ingredient of recipes[item].ingredients) {
            const key = ingredient[0];
            const realCount = ingredient[1] ? ingredient[1] * times[item] : times[item];
            currentItems[key] -= realCount;
        }
        if (currentItems[item]) {
            currentItems[item] += count[item];
        } else {
            currentItems[item] = count[item];
        }
        window.persistentCurrentItems.push(deepClone(currentItems));
        // console.log(`${recipes[item].type}: ${recipes[item].ingredients.map(i => `${i[0]} x ${i[1] ? i[1] * times[item] : times[item]}`).join(' + ')} => ${item} x ${count[item]}`);
        orderHtml += `
            <tr data-index="${i}">
                <td${recipes[item].isGeneratedMap ? ' class="generated-map"' : ''}>${recipes[item].map ? isBigMap(recipes[item].map) ? '<button class="btn btn-default detail">详情</button>' : renderMap(item) : ''}</td>
                <td class="item-group">${recipes[item].ingredients.map(i => `${renderItem(i[0], i[1] ? i[1] * times[item] : times[item])}`).join('')}</td>
                <td>${renderItem(recipes[item].type, 0)}</td>
                <td>${renderItem(item, count[item])}${patchedRecipes[item] ? ` <span class="recipe-patched" title="已被 ${escapeHtml(patchedRecipes[item])} 补丁修改">${escapeHtml(patchedRecipes[item])}</span>` : ''}</td>
                <td class="detail-column"><button class="btn btn-default detail">详情</button></td>
            </tr>
        `;
    }
    $("#recipe-table").html(orderHtml);
    console.log(remainings);
    let remainingHtml = '';
    if (!$.isEmptyObject(remainings)) {
        for (const item in remainings) {
            remainingHtml += renderItem(item, remainings[item]);
        }
    } else {
        remainingHtml = '无';
    }
    window.basicCountOrder = [];
    for (const item of order) {
        for (const ingredient of recipes[item].ingredients) {
            if (!basicCountOrder.includes(ingredient[0])) {
                basicCountOrder.push(ingredient[0]);
            }
        }
    }
    sortBasicCount();
    $("#item-remain").html(remainingHtml);
    $("#results").show();
    $("#apply-remain-to-have").show();
}

function doSearch() {
    const keyword = $("#input-item").val().trim();

    if (keyword.length > 0) {
        const result = searchItem(keyword);
        showResult(result);
    } else {
        $('#search-result').hide();
    }
}

function checkNumber(input) {
    const value = input.value.replace(/[^0-9]+/g, '');
    if (value.length === 0) {
        input.value = '';
        return;
    }
    const num = parseInt(value);
    if (isNaN(num)) {
        input.value = '';
    } else {
        input.value = num;
    }
}

function showDirtyWarning() {
    $("#dirty-warning").show();
    $("#calculate").addClass("btn-warning");
    scheduleAutoCalculate();
}

function hideDirtyWarning() {
    $("#dirty-warning").hide();
    $("#calculate").removeClass("btn-warning");
}

function scheduleAutoCalculate() {
    if (window.autoCalculateTimer) {
        clearTimeout(window.autoCalculateTimer);
        window.autoCalculateTimer = null;
    }
    const delayStr = $("#setting-auto-calculate").val();
    if (delayStr === undefined || delayStr === null || delayStr === '') {
        return;
    }
    const delay = parseInt(delayStr);
    if (isNaN(delay) || delay < 0) {
        return;
    }
    window.autoCalculateTimer = setTimeout(function () {
        $("#calculate").click();
    }, delay);
}

function addAlreadyItem(key = "", count = -1, update = true) {
    const $table = $("#item-already-have");
    const escapedKey = escapeHtml(key);
    const escapedCount = escapeHtml(count === -1 ? '' : count);
    $table.append(`
        <tr>
            <td>${renderItem(key, -1)}</td>
            <td><input type="text" class="form-control in-computation-process" name="key" list="item-list" value="${escapedKey}"></td>
            <td><input type="text" class="form-control in-computation-process" name="count" oninput="checkNumber(this)" value="${escapedCount}"></td>
            <td><button class="btn btn-danger" data-action="delete">删除</button></td>
        </tr>
    `);
    if (!key) {
        $table.find('input[name=key]').last().focus();
    }
    showDirtyWarning();
    if (update && key) {
        showRecipe();
    }
}

function applyRemainToAlreadyHave() {
    if ($.isEmptyObject(window.remainings)) {
        return;
    }

    const $table = $("#item-already-have");
    const existingRows = {};

    $table.find('tr').each(function () {
        const $tr = $(this);
        if ($tr.is('#item-already-have-header') || $tr.is('#add-item-row')) {
            return;
        }
        const key = $tr.find('input[name=key]').val().trim();
        const countInput = $tr.find('input[name=count]').val().trim();
        if (key) {
            existingRows[key] = {$tr, count: countInput};
        }
    });

    for (const key in window.remainings) {
        const remainCount = window.remainings[key];
        if (existingRows[key]) {
            if (existingRows[key].count !== '' && parseInt(existingRows[key].count) !== -1) {
                existingRows[key].$tr.find('input[name=count]').val(remainCount);
            }
        } else {
            addAlreadyItem(key, remainCount, false);
        }
    }

    $("#apply-remain-to-have").hide();
    showDirtyWarning();
}

function readAlreadyHave() {
    window.alreadyHave = {};
    const $table = $("#item-already-have");
    // 遍历tr
    $table.find('tr').each(function () {
        const $tr = $(this);
        if ($tr.is('#item-already-have-header') || $tr.is('#add-item-row')) {
            return;
        }
        const key = $tr.find('input[name=key]').val().trim();
        let count = $tr.find('input[name=count]').val().trim();
        if (!count) {
            count = -1;
        }
        if (window.alreadyHave[key]) {
            if (window.alreadyHave[key] === -1 || parseInt(count) === -1) {
                window.alreadyHave[key] = -1;
            } else {
                window.alreadyHave[key] += parseInt(count);
            }
        } else {
            window.alreadyHave[key] = parseInt(count);
        }
    });
}

function renderItem(key, count = 0) {
    if (key === null) {
        return `<span class="item-empty"></span>`;
    }
    const escapedKey = escapeHtml(key);
    if (count === -1) {
        if (getIconUrl(key)) {
            return `<span class="item just-icon" data-key="${escapedKey}"><img class="item-icon" data-key="${escapedKey}" src="${getIconUrl(key)}" alt="" title="${escapedKey}"></span>`;
        } else {
            let reducedKey = key.replace(/[^A-Za-z0-9一-龟]+/g, '');
            if (reducedKey.length > 2) {
                reducedKey = reducedKey.charAt(0) + reducedKey.slice(-1);
            }
            return `<span class="item just-icon" data-key="${escapedKey}"><div class="item-icon-unknown ${key.length === 1 ? 'item-icon-unknown-single' : 'item-icon-unknown-double'}" title="${escapedKey}">${escapeHtml(reducedKey)}</div></span>`;
        }
    } else if (count === 0) {
        return `<span class="item" data-key="${escapedKey}">${getIconUrl(key) ? `<img class="item-icon" data-key="${escapedKey}" src="${getIconUrl(key)}" alt="">` : ''}${escapedKey}</span>`;
    } else {
        let maxStackSize = items[key]?.maxStackSize ?? 64;
        if (maxStackSize === 0) {
            console.error(`${key} 的 maxStackSize 为 0`);
            maxStackSize = 1;
        }
        let humanCount;
        if (maxStackSize === 1) {
            humanCount = `${count}`;
        } else {
            const quotient = Math.floor(count / maxStackSize);
            const remainder = count % maxStackSize;
            if (quotient > 0) {
                if (remainder > 0) {
                    humanCount = `<span class="group-count">${escapeHtml(quotient)}</span><span class="group-sep">×${escapeHtml(maxStackSize)}</span><span class="plus">+</span>${escapeHtml(remainder)}`;
                } else {
                    humanCount = `<span class="group-count">${escapeHtml(quotient)}</span><span class="group-sep">×${escapeHtml(maxStackSize)}</span>`;
                }
            } else {
                humanCount = `${remainder}`;
            }
        }
        return `<span class="item" data-key="${escapedKey}">${getIconUrl(key) ? `<img class="item-icon" data-key="${escapedKey}" src="${getIconUrl(key)}" alt="">` : ''}${escapedKey} <span class="count">${humanCount}</span></span>`;
    }
}

function showInference() {
    window.showedInference = true;
    const $inference = $('#inference-panel');
    $inference.empty();
    let currentDepth = 0;
    let result = '';
    for (const inference of window.inferences) {
        if (inference.depth > currentDepth) {
            result += `<ul><li>`;
        } else if (inference.depth < currentDepth) {
            result += `</li></ul>`.repeat(currentDepth - inference.depth) + `</li><li>`;
        } else {
            result += `</li><li>`;
        }
        currentDepth = inference.depth;
        result += `${renderItem(inference.type)}: 合成 ${renderItem(inference.key, inference.realCount)} 需要 ${inference.ingredients.map(i => renderItem(i.key, i.count)).join('')}`;
    }
    if (currentDepth > 0) {
        result += `</li></ul>`.repeat(currentDepth);
    }
    $inference.html(result);
    $inference.show();
}

function activateSearchItem(key) {
    window.activeSearchResult = null;
    window.activeSearchResultIndex = null;
    $("#input-item").val(key).blur();
    const $result = $('#search-result');
    $result.hide();
    window.currentShowing = [[key, 1]];
    hideDirtyWarning();
    showRecipe();
}

function getIconUrl(key) {
    return items[key]?.icon ? `icons/${items[key]?.icon}.png` : null;
}

function sortBasicCount() {
    if ($.isEmptyObject(window.basicCount)) {
        $("#item-needed").text("无");
        return;
    }
    let sortType = $("#item-needed-sort").val();
    let sortedItems = Object.keys(basicCount);
    if (sortType === 'order') {
        sortedItems.sort((a, b) => window.basicCountOrder.indexOf(a) - window.basicCountOrder.indexOf(b));
    } else if (sortType === 'name') {
        sortedItems.sort((a, b) => a.localeCompare(b));
    } else if (sortType === 'count') {
        sortedItems.sort((a, b) => basicCount[b] - basicCount[a]);
    }
    let basicCountHtml = '';
    for (const item of sortedItems) {
        basicCountHtml += renderItem(item, basicCount[item]);
    }
    $("#item-needed").html(basicCountHtml);
}

function toShowInference() {
    if ($("#inference-toggle").next().attr("aria-expanded") === "true") {
        if (!window.showedInference) {
            showInference();
        }
    }
}

function downloadFile(fileName, content, fileType) {
    const blob = new Blob([content], {type: fileType});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showStepRemain() {
    if (window.currentShowingStep === null) {
        return;
    }
    let sortType = $("#step-remain-sort").val();
    const currentShowingStepItems = persistentCurrentItems[currentShowingStep];
    const entries = Object.keys(currentShowingStepItems);
    if (sortType === 'order') {
        entries.sort((a, b) => window.basicCountOrder.indexOf(a) - window.basicCountOrder.indexOf(b));
    } else if (sortType === 'name') {
        entries.sort((a, b) => a.localeCompare(b));
    } else if (sortType === 'count') {
        entries.sort((a, b) => currentShowingStepItems[b] - currentShowingStepItems[a]);
    }
    $("#step-remain").html(entries.map(item => currentShowingStepItems[item] > 0 ? `${renderItem(item, currentShowingStepItems[item])}` : '').join(''));
}

function isBigMap(map) {
    if (map.length > 3) {
        return true;
    }
    for (const row of map) {
        if (row.length > 3) {
            return true;
        }
    }
    return false;
}

$(function () {
    const $result = $('#search-result');
    $result.hide();

    $('#input-item')
        .on('input', updateInput)
        .focus(function () {
            doSearch();
            $(this).select();
        })
        .keydown(function (event) {
            if (event.key === 'Enter') {
                const key = window.activeSearchResult;
                if (!key) {
                    return;
                }
                activateSearchItem(key);
            } else if (event.key === 'ArrowUp') {
                if (window.activeSearchResultIndex > 0) {
                    setActiveSearchResult($(`#search-result table tr:eq(${window.activeSearchResultIndex - 1})`));
                }
            } else if (event.key === 'ArrowDown') {
                if (window.activeSearchResultIndex < window.searchResult.length - 1) {
                    setActiveSearchResult($(`#search-result table tr:eq(${window.activeSearchResultIndex + 1})`));
                }
            }
        });

    $("#search-result").on('mouseover', '.search-result-item', function (event) {
        setActiveSearchResult($(event.target).closest('tr'));
    }).on('click', 'td', function (event) {
        const key = $(event.target).closest('tr').data('key');
        activateSearchItem(key);
    });

    $("#add-item").click(function () {
        addAlreadyItem();
    });

    $("#add-item-target").click(function () {
        showDirtyWarning();
        addTargetItemRow('', '1');
        $itemTargetList.find('input[name=key]').last().focus();
    });

    $("#item-already-have,#item-target-list").on('click', '[data-action=delete]', function (event) {
        $(event.target).parent().parent().remove();
        showDirtyWarning();
        showRecipe();
    }).on('focus', 'input', function (event) {
        event.target.select();
    }).on('input', 'input[name=key]', function (event) {
        const key = $(event.target).val().trim();
        const isItemTargetList = $(event.target).closest("tbody").is("#item-target-list");
        if (key.length > 0) {
            if (recipes[key]) {
                $(event.target).parent().prev().html(renderItem(key, -1));
                $(event.target).removeClass('has-error');
                $(event.target).removeClass('has-warning');
            } else {
                if (isItemTargetList) {
                    if (items[key]?.icon) {
                        $(event.target).parent().prev().html(renderItem(key, -1));
                    } else {
                        $(event.target).parent().prev().html(renderItem('', -1));
                    }
                    $(event.target).addClass('has-error');
                    $(event.target).removeClass('has-warning');
                } else {
                    if (items[key]?.icon) {
                        $(event.target).parent().prev().html(renderItem(key, -1));
                        $(event.target).addClass('has-warning');
                        $(event.target).removeClass('has-error');
                    } else {
                        $(event.target).parent().prev().html(renderItem('', -1));
                        $(event.target).addClass('has-error');
                        $(event.target).removeClass('has-warning');
                    }
                }
            }
        } else {
            $(event.target).parent().prev().html(renderItem('', -1));
            $(event.target).removeClass('has-error');
        }
    }).on('input', 'input[name=count]', function (event) {
        if ($(event.target).closest("tbody").is("#item-target-list")) {
            const count = $(event.target).val().trim();
            if (count === '' || parseInt(count) <= 0) {
                $(event.target).addClass('has-error');
            } else {
                $(event.target).removeClass('has-error');
            }
        }
    }).on('keydown', 'input', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const itemHtml = `
                <tr>
                    <td>${renderItem('', -1)}</td>
                    <td><input type="text" class="form-control in-computation-process" name="key" list="item-list"></td>
                    <td><input type="text" class="form-control in-computation-process" name="count" oninput="checkNumber(this)" value="${$(event.target).closest("tbody").is("#item-target-list") ? 1 : ''}"></td>
                    <td><button class="btn btn-danger" data-action="delete">删除</button></td>
                </tr>
            `;
            // Shift键添加到上一行
            if (event.shiftKey) {
                $(event.target).closest('tr').before(itemHtml);
                $(event.target).closest('tr').prev().find('input[name=key]').last().focus();
            } else {
                $(event.target).closest('tr').after(itemHtml);
                $(event.target).closest('tr').next().find('input[name=key]').last().focus();
            }
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            const $tr = $(event.target).closest('tr');
            if ($(event.target).is('[name=key]')) {
                if ($tr.prev().length > 0) {
                    $tr.prev().find('input[name=key]').last().focus();
                }
            } else {
                if ($tr.prev().length > 0) {
                    $tr.prev().find('input[name=count]').last().focus();
                }
            }
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            const $tr = $(event.target).closest('tr');
            if ($(event.target).is('[name=key]')) {
                if ($tr.next().length > 0) {
                    $tr.next().find('input[name=key]').last().focus();
                }
            } else {
                if ($tr.next().length > 0) {
                    $tr.next().find('input[name=count]').last().focus();
                }
            }
        }
    });

    $(".toggle-panel").click(function () {
        if ($("#setting-expand-confirm").is(":checked") && inferences.length > 100) {
            const result = confirm("当前页面显示的步骤较多，展开/折叠可能会造成卡顿，是否仍要继续？");
            if (!result) {
                return;
            }
        }
        $(this).next().collapse('toggle');
    });

    // $("#introduction-toggle").next().collapse('toggle');

    $("#inference-toggle").click(function () {
        toShowInference();
    });

    $("#calculate").click(function () {
        const $calculationAlert = $("#calculation-alert");
        readItemList();
        hideDirtyWarning();
        if (window.currentShowing.length === 0) {
            $calculationAlert.text('请先输入物品').show();
            return;
        }
        const cantFind = [];
        for (const item of window.currentShowing) {
            const key = item[0];
            if (!recipes[key]) {
                cantFind.push(key);
            }
        }
        if (cantFind.length > 0) {
            $calculationAlert.text(`找不到配方 ${cantFind.join(', ')}`).show();
            return;
        }
        showRecipe();
    });

    $("body")
        .on('click', '.item', function (event) {
            if (!$(event.target).hasClass('item')) {
                event.target = $(event.target).closest('.item')[0];
            }
            const key = $(event.target).data('key');
            if (!key) {
                return;
            }
            for (const item of window.currentShowing) {
                if (item[0] === key) {
                    alert(`${key} 是目标物品`);
                    return;
                }
            }
            if (recipes[key]) {
                readAlreadyHave();
                if (window.alreadyHave[key] === undefined) {
                    addAlreadyItem(key);
                } else {
                    const confirmed = confirm(`已经拥有 ${key}，是否仍要添加？`);
                    if (confirmed) {
                        addAlreadyItem(key);
                    }
                }
            } else {
                const confirmed = confirm(`${key} 是基础物品，是否仍要添加？`);
                if (confirmed) {
                    addAlreadyItem(key);
                }
            }
        })
        .on('input', '.in-computation-process', function (event) {
            showDirtyWarning();
        })
        .on('mouseenter', '.item', function (event) {
            if (!$("#setting-hover-highlight").is(":checked")) return;
            const $item = $(event.target).closest('.item');
            const key = $item.data('key');
            if (!key) return;
            $(`.item[data-key="${CSS.escape(key)}"]`).addClass('highlight');
        })
        .on('mouseleave', '.item', function (event) {
            const $item = $(event.target).closest('.item');
            const key = $item.data('key');
            if (!key) return;
            $(`.item[data-key="${CSS.escape(key)}"]`).removeClass('highlight');
        })
        .on('show.bs.modal', '.modal', function () {
            const visibleModals = $('.modal:visible').length;
            const newZIndex = 1055 + (10 * visibleModals); // 每打开一个，z-index +10
            $(this).css('z-index', newZIndex);
            // 调整当前模态框的backdrop层级
            setTimeout(() => {
                $('.modal-backdrop').last().css('z-index', newZIndex - 1);
            });
        })
        .on('hidden.bs.modal', '.modal', function () {
            const visibleModals = $('.modal:visible').length;
            if (visibleModals !== 0) {
                $("body").addClass("modal-open");
            }
        });

    // $("#add-dusts").click(function () {
    //     readAlreadyHave();
    //     for (const dust of ["铁粉", "金粉", "铜粉", "锡粉", "银粉", "铅粉", "铝粉", "锌粉", "镁粉"]) {
    //         if (window.alreadyHave[dust] === undefined) {
    //             addAlreadyItem(dust, undefined, false);
    //         }
    //     }
    //     showRecipe();
    // });
    const $itemTargetList = $("#item-target-list");
    $itemTargetList.append(`
        <tr>
            <td>${renderItem('', -1)}</td>
            <td><input type="text" class="form-control in-computation-process" name="key" list="item-list"></td>
            <td><input type="text" class="form-control in-computation-process" name="count" oninput="checkNumber(this)" value="1"></td>
            <td><button class="btn btn-danger" data-action="delete">删除</button></td>
        </tr>
    `);

    $("#input-item-select").on('change', function () {
        const mode = $(this).val();
        if (mode === "single") {
            $("#single-item-input").show();
            $("#multi-item-input,#edit-target-list").hide();
            window.multiItemMode = false;
        } else {
            $("#single-item-input").hide();
            $("#multi-item-input,#edit-target-list").show();
            window.multiItemMode = true;
        }
        showDirtyWarning();
        debouncedSaveState();
    });

    $("#loading").hide();
    $("#main").show();

    const $itemList = $("#item-list");
    for (const key in recipes) {
        // const ingredients = recipes[key].ingredients;
        // const ingredientStr = ingredients.map(([i, j]) => renderItem(i, j)).join(', ');
        const ingredientStr = "";
        $itemList.append(`<option value="${key}">${ingredientStr}</option>`);
    }

    const savedState = loadState();
    if (savedState) {
        applyState(savedState);
    }

    const $saveTriggers = $("#input-item, #item-target-list, #item-already-have, #input-item-select");
    $saveTriggers.on('input change', debouncedSaveState);

    $(window).on('beforeunload', saveState);

    $("#apply-remain-to-have").click(applyRemainToAlreadyHave);

    $("#item-needed-sort").change(function () {
        sortBasicCount();
    });

    $("#step-remain-sort").change(function () {
        showStepRemain();
    });

    let currentEditList = null;

    function openListEditModal(listType) {
        currentEditList = listType;
        const format = $('input[name="list-format"]:checked').val();
        const separator = format === 'csv' ? ',' : '\t';

        let content = '';
        if (listType === 'target') {
            const title = '编辑目标物品列表';
            $("#modal-list-title").text(title);
            $itemTargetList.find("tr").each(function () {
                const $tr = $(this);
                const item = $tr.find('input[name=key]').val().trim();
                const count = $tr.find('input[name=count]').val().trim() || '1';
                if (item || count !== '1') {
                    content += `${item}${separator}${count}\n`;
                }
            });
        } else if (listType === "alreadyHave") {
            const title = '编辑已有物品列表';
            $("#modal-list-title").text(title);
            $("#item-already-have").find("tr").each(function () {
                const $tr = $(this);
                if ($tr.is('#item-already-have-header') || $tr.is('#add-item-row')) {
                    return;
                }
                const item = $tr.find('input[name=key]').val().trim();
                let count = $tr.find('input[name=count]').val().trim();
                if (item && count === '') {
                    content += `${item}\n`;
                } else if (item && count !== '') {
                    content += `${item}${separator}${count}\n`;
                }
            });
        }

        $("#list-edit-content").val(content.trim());
        $("#list-edit-error").hide();
        $("#list-edit-modal").modal('show');
    }

    function applyListEdit() {
        const format = $('input[name="list-format"]:checked').val();
        const separator = format === 'csv' ? ',' : '\t';
        const lines = $("#list-edit-content").val().split('\n');
        const items = [];
        let errorMsg = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trimEnd();
            if (!line) continue;
            const parts = line.split(separator);
            if (currentEditList === 'target') {
                if (parts.length !== 2) {
                    errorMsg = `第 ${i + 1} 行格式错误：需要两个值（物品名称和数量），当前有 ${parts.length} 个值`;
                    break;
                }
            } else if (currentEditList === 'alreadyHave') {
                if (parts.length !== 2 && parts.length !== 1) {
                    errorMsg = `第 ${i + 1} 行格式错误：需要1或2个值（物品名称和数量），当前有 ${parts.length} 个值`;
                    break;
                }
            }
            const key = parts[0].trim();
            const countStr = parts[1]?.trim() || '';
            const count = parseInt(countStr);
            if (countStr !== '' && (isNaN(count) || count < 0)) {
                errorMsg = `第 ${i + 1} 行格式错误：数量 "${countStr}" 不是非负整数`;
                break;
            }
            items.push({key, count: countStr});
        }

        if (errorMsg) {
            $("#list-edit-error").text(errorMsg).show();
            return;
        }

        if (currentEditList === 'target') {
            $itemTargetList.empty();
            for (const item of items) {
                const key = item.key || '';
                const count = item.count === -1 ? '1' : String(item.count);
                addTargetItemRow(key, count);
            }
        } else {
            const $table = $("#item-already-have");
            $table.find('tr').each(function () {
                const $tr = $(this);
                if (!$tr.is('#item-already-have-header') && !$tr.is('#add-item-row')) {
                    $tr.remove();
                }
            });
            for (const item of items) {
                const key = item.key || '';
                const count = item.count;
                addAlreadyItem(key, count, false);
            }
        }

        showDirtyWarning();
        $("#list-edit-modal").modal('hide');
    }

    function addTargetItemRow(key = '', count = '1') {
        const $tbody = $itemTargetList;
        const escapedKey = escapeHtml(key);
        const escapedCount = escapeHtml(count);
        const $tr = $(`
            <tr>
                <td>${renderItem(key, -1)}</td>
                <td><input type="text" class="form-control in-computation-process" name="key" list="item-list" value="${escapedKey}"></td>
                <td><input type="text" class="form-control in-computation-process" name="count" oninput="checkNumber(this)" value="${escapedCount}"></td>
                <td><button class="btn btn-danger" data-action="delete">删除</button></td>
            </tr>
        `);
        $tbody.append($tr);
        if (key && recipes[key]) {
            $tr.find('input[name=key]').removeClass('has-error');
        }
    }

    $("#edit-target-list").click(function () {
        openListEditModal('target');
    });

    $("#edit-already-have").click(function (event) {
        openListEditModal('alreadyHave');
        event.stopPropagation();
    });

    $("#list-edit-apply").click(applyListEdit);

    $('input[name="list-format"]').change(function () {
        const format = $(this).val();
        const separator = format === 'csv' ? ',' : '\t';
        const $listEditContent = $("#list-edit-content");
        const content = $listEditContent.val();
        if (content) {
            const lines = content.split('\n');
            const newLines = lines.map(line => {
                const parts = line.split(/[,\t]/);
                if (parts.length === 2) {
                    return parts[0].trim() + separator + parts[1].trim();
                }
                return line;
            });
            $listEditContent.val(newLines.join('\n'));
        }
    });

    const savedSettings = loadSettings();
    if (savedSettings) {
        applySettings(savedSettings);
    }

    $(".setting-input").change(function () {
        saveSettings();
    });

    window.recipePatches = loadPatches();
    window.defaultRecipes = deepClone(recipes);

    function renderPatchList() {
        const $tbody = $("#patch-list-table");
        $tbody.empty();
        for (let i = 0; i < window.dirtyRecipePatches.length; i++) {
            const patch = window.dirtyRecipePatches[i];
            const recipeCount = Object.keys(patch.data).filter(k => patch.data[k] !== null).length;
            const escapedName = escapeHtml(patch.name);
            const $tr = $(`
                <tr data-index="${i}">
                    <td>${i + 1}</td>
                    <td><input type="checkbox" class="patch-able"></td>
                    <td>${escapedName}</td>
                    <td>${recipeCount}</td>
                    <td>
                        <button class="btn btn-xs btn-default patch-move-up" ${i === 0 ? 'disabled' : ''}>上移</button>
                        <button class="btn btn-xs btn-default patch-move-down" ${i === window.dirtyRecipePatches.length - 1 ? 'disabled' : ''}>下移</button>
                        <button class="btn btn-xs btn-primary patch-edit">编辑</button>
                        <button class="btn btn-xs btn-default patch-export-single">导出</button>
                        <button class="btn btn-xs btn-danger patch-delete">删除</button>
                    </td>
                </tr>
            `);
            $tr.find('.patch-able').prop('checked', patch.enabled);
            $tbody.append($tr);
        }
        if (window.dirtyRecipePatches.length === 0) {
            $tbody.append('<tr><td colspan="5" class="text-center text-muted">暂无补丁</td></tr>');
        }
    }

    let currentPatchIndex = -1;

    function openPatchManageModal() {
        window.dirtyRecipePatches = deepClone(window.recipePatches);
        renderPatchList();
        $("#patch-list-error").hide();
        $("#patch-manage-modal").modal('show');
    }

    function openPatchEditModal(index) {
        currentPatchIndex = index;
        const patch = index >= 0 ? window.dirtyRecipePatches[index] : {name: '', data: {}, enabled: true};
        $("#patch-edit-title").text(index >= 0 ? '编辑补丁' : '添加补丁');
        $("#patch-name").val(patch.name);
        $("#patch-data").val(JSON.stringify(patch.data, null, 2));
        $("#patch-edit-error").hide();
        $("#patch-edit-modal").modal('show');
    }

    function savePatchFromModal() {
        const name = $("#patch-name").val().trim();
        const dataStr = $("#patch-data").val();
        let data;

        if (!name) {
            $("#patch-edit-error").text('请输入补丁名称').show();
            return;
        }

        for (const [index, patch] of dirtyRecipePatches.entries()) {
            if (patch.name === name) {
                if (index === currentPatchIndex) {
                    continue;
                }
                $("#patch-edit-error").text('补丁名称重复，请修改').show();
                return;
            }
        }

        try {
            data = JSON.parse(dataStr);
        } catch (e) {
            $("#patch-edit-error").text('JSON格式错误：' + e.message).show();
            return;
        }

        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            $("#patch-edit-error").text('补丁数据必须是JSON对象').show();
            return;
        }

        for (const key in data) {
            if (data[key] === null) {
                continue;
            }
            if (!(typeof data[key] === 'object')) {
                $("#patch-edit-error").text(`补丁数据格式错误："${key}" 必须是对象`).show();
                return;
            }
            if (!("type" in data[key])) {
                $("#patch-edit-error").text(`补丁数据格式错误：每个配方必须包含 type 字段，而 "${key}" 没有该字段`).show();
                return;
            }
            if (!("ingredients" in data[key])) {
                $("#patch-edit-error").text(`补丁数据格式错误：每个配方必须包含 ingredients 字段，而 "${key}" 没有该字段`).show();
                return;
            }
            if (!Array.isArray(data[key].ingredients)) {
                $("#patch-edit-error").text(`补丁数据格式错误： "${key}" 的 ingredients 字段必须是数组，而 "${key}" 的 "${JSON.stringify(data[key].ingredients)}" 不是数组`).show();
                return;
            }
            for (const ingredient of data[key].ingredients) {
                const ingredientStr = JSON.stringify(ingredient);
                if (!Array.isArray(ingredient)) {
                    $("#patch-edit-error").text(`补丁数据格式错误：ingredient "${ingredientStr}" 必须是数组，而 "${key}" 的 "${ingredientStr}" 不是数组`).show();
                    return;
                }
                if (ingredient.length > 2 || ingredient.length < 1) {
                    $("#patch-edit-error").text(`补丁数据格式错误： "${key}" 的 ingredient "${ingredientStr}" 长度必须在 1 到 2 之间（第一项是物品名称，第二项是数量，如果没有数量，则默认为 1）`).show();
                    return;
                }
                if (typeof ingredient[0] !== 'string') {
                    $("#patch-edit-error").text(`补丁数据格式错误：ingredient "${ingredientStr}" 中的 "${ingredient[0]}" 必须是字符串，而 "${key}" 的 "${ingredientStr}" 中的 "${ingredient[0]}" 不是字符串`).show();
                    return;
                }
                if (ingredient[1] && (typeof ingredient[1] !== 'number' || isNaN(ingredient[1]) || ingredient[1] < 1)) {
                    $("#patch-edit-error").text(`补丁数据格式错误： "${key}" 的 ingredient "${ingredientStr}" 中的 "${ingredient[0]}" 数量 "${ingredient[1]}" 不是正整数`).show();
                    return;
                }
            }
            if ("map" in data[key]) {
                const mapStr = JSON.stringify(data[key].map);
                if (!Array.isArray(data[key].map)) {
                    $("#patch-edit-error").text(`补丁数据格式错误： "${key}" 的 map 字段必须是数组，而 "${key}" 的 "${mapStr}" 不是数组`).show();
                    return;
                }
                for (const row of data[key].map) {
                    const rowStr = JSON.stringify(row);
                    if (!Array.isArray(row)) {
                        $("#patch-edit-error").text(`补丁数据格式错误： "${key}" 的 map 字段的每一项必须是数组，而 "${key}" 的 "${mapStr}" 的 "${rowStr}" 不是数组`).show();
                        return;
                    }
                    for (const cell of row) {
                        const cellStr = JSON.stringify(cell);
                        if (typeof cell !== 'string' && cell !== null) {
                            $("#patch-edit-error").text(`补丁数据格式错误： "${key}" 的 map 字段的每一项的每一项必须是字符串或 null，而 "${key}" 的 "${mapStr}" 的 "${rowStr}" 的 "${cellStr}" 不是字符串或 null`).show();
                            return;
                        }
                    }
                }
            }
            if ("count" in data[key]) {
                const count = data[key].count;
                if (typeof count !== 'number' || isNaN(count) || count <= 0) {
                    $("#patch-edit-error").text(`补丁数据格式错误： "${key}" 的 count 字段必须是正数，而 "${key}" 的 "${count}" 不是正数`).show();
                    return;
                }
            }
        }

        if (currentPatchIndex >= 0) {
            window.dirtyRecipePatches[currentPatchIndex] = {name, data, enabled: window.dirtyRecipePatches[currentPatchIndex]?.enabled ?? true};
        } else {
            window.dirtyRecipePatches.push({name, data, enabled: true});
        }

        renderPatchList();
        $("#patch-edit-modal").modal('hide');
    }

    $("#manage-recipe-patches").click(openPatchManageModal);

    $("#patch-add").click(function () {
        openPatchEditModal(-1);
    });

    $("#patch-list-table")
        .on('click', '.patch-edit', function () {
            const index = parseInt($(this).closest('tr').data('index'));
            openPatchEditModal(index);
        })
        .on('click', '.patch-delete', function () {
            const index = parseInt($(this).closest('tr').data('index'));
            if (confirm(`确定要删除补丁 "${window.dirtyRecipePatches[index].name}" 吗？`)) {
                window.dirtyRecipePatches.splice(index, 1);
                renderPatchList();
            }
        })
        .on('click', '.patch-move-up', function () {
            const index = parseInt($(this).closest('tr').data('index'));
            if (index > 0) {
                const temp = window.dirtyRecipePatches[index];
                window.dirtyRecipePatches[index] = window.dirtyRecipePatches[index - 1];
                window.dirtyRecipePatches[index - 1] = temp;
                renderPatchList();
            }
        })
        .on('click', '.patch-move-down', function () {
            const index = parseInt($(this).closest('tr').data('index'));
            if (index < window.dirtyRecipePatches.length - 1) {
                const temp = window.dirtyRecipePatches[index];
                window.dirtyRecipePatches[index] = window.dirtyRecipePatches[index + 1];
                window.dirtyRecipePatches[index + 1] = temp;
                renderPatchList();
            }
        })
        .on('click', '.patch-export-single', function () {
            const index = parseInt($(this).closest('tr').data('index'));
            const patch = window.dirtyRecipePatches[index];
            const exportData = JSON.stringify(patch, null, 2);
            downloadFile(`${patch.name}.json`, exportData, 'application/json');
        })
        .on('change', '.patch-able', function () {
            const index = parseInt($(this).closest('tr').data('index'));
            window.dirtyRecipePatches[index].enabled = $(this).prop('checked');
        });

    $("#patch-edit-save").click(savePatchFromModal);

    $("#patch-save").click(function () {
        const result = applyPatchesWithValidation();
        if (!result.success) {
            $("#patch-list-error").html(result.error).show();
            return;
        }
        savePatches();
        showDirtyWarning();
        $("#patch-manage-modal").modal('hide');
    });

    $("#patch-import").click(function () {
        $("#patch-import-file").click();
    });

    $("#patch-import-file").change(function (event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const imported = JSON.parse(e.target.result);
                let patchesToImport = [];

                if (Array.isArray(imported)) {
                    patchesToImport = imported;
                } else if (typeof imported === 'object' && imported !== null) {
                    patchesToImport = [imported];
                } else {
                    alert('导入文件格式错误');
                    return;
                }

                for (const patch of patchesToImport) {
                    if (!patch.name || !patch.data || typeof patch.data !== 'object') {
                        alert('导入数据格式错误：每个补丁必须包含 name 和 data 字段');
                        return;
                    }
                    patch.enabled ??= true;
                }

                const conflictNames = [];
                for (const patch of patchesToImport) {
                    const existing = window.dirtyRecipePatches.find(p => p.name === patch.name);
                    if (existing) {
                        conflictNames.push(patch.name);
                    }
                }

                if (conflictNames.length > 0) {
                    if (!confirm(`以下补丁名称已存在：${conflictNames.join(', ')}。是否覆盖？`)) {
                        return;
                    }
                    window.dirtyRecipePatches = window.dirtyRecipePatches.filter(p => !conflictNames.includes(p.name));
                }

                window.dirtyRecipePatches = window.dirtyRecipePatches.concat(patchesToImport);
                renderPatchList();
                alert(`成功导入 ${patchesToImport.length} 个补丁`);
            } catch (e) {
                alert('解析JSON文件失败：' + e.message);
            }
        };
        reader.readAsText(file);
        $(this).val('');
    });

    $("#patch-export").click(function () {
        if (window.dirtyRecipePatches.length === 0) {
            alert('暂无补丁可导出');
            return;
        }
        downloadFile('recipe-patches.json', JSON.stringify(window.dirtyRecipePatches, null, 2), 'application/json');
    });

    $("#patch-export-enabled").click(function () {
        const enabledPatches = window.dirtyRecipePatches.filter(p => p.enabled);
        if (enabledPatches.length === 0) {
            alert('暂无已启用补丁可导出');
            return;
        }
        downloadFile('enabled-recipe-patches.json', JSON.stringify(enabledPatches, null, 2), 'application/json');
    });

    // $("#patch-edit-modal").on("hidden.bs.modal", function () {
    //     $("#patch-manage-modal").modal('show');
    // });

    const result = applyPatchesWithValidation(window.recipePatches);
    if (!result.success) {
        openPatchManageModal();
        $("#patch-list-error").html(result.error).show();
    }

    $("#setting-modal-esc").change(function (event) {
        const value = $(this).is(":checked");
        if (value) {
            $(".modal").attr("data-keyboard", "true");
        } else {
            $(".modal").attr("data-keyboard", "false");
        }
        if (event.isTrigger === undefined) {
            $("#setting-alert").show();
        }
    }).change();

    $("#setting-modal-backdrop").change(function (event) {
        const value = $(this).is(":checked");
        if (value) {
            $(".modal").attr("data-backdrop", "true");
        } else {
            $(".modal").attr("data-backdrop", "static");
        }
        if (event.isTrigger === undefined) {
            $("#setting-alert").show();
        }
    }).change();

    $("#setting-show-detail-column").change(function (event) {
        const value = $(this).is(":checked");
        if (value) {
            $("body").removeClass("hide-detail-column");
        } else {
            $("body").addClass("hide-detail-column");
        }
    }).change();

    $("#setting-show-generated-map").change(function (event) {
        const value = $(this).is(":checked");
        if (value) {
            $("body").removeClass("hide-generated-map");
        } else {
            $("body").addClass("hide-generated-map");
        }
    }).change();

    $("#setting-missingno").change(function (event) {
        const value = $(this).is(":checked");
        if (value) {
            $("body").addClass("missingno");
        } else {
            $("body").removeClass("missingno");
        }
    }).change();

    $("#setting-minecraft-ui").change(function (event) {
        const value = $(this).is(":checked");
        if (event.isTrigger) {
            // console.log("isTrigger");
            if (value) {
                $("#minecraft-ui-style").prop("disabled", false);
            } else {
                $("#minecraft-ui-style").prop("disabled", true);
            }
        } else {
            // console.log("!isTrigger");
            if (value) {
                $("#long-transition").prop("disabled", false);
                // console.log("enable long transition");
                $("#minecraft-ui-style").prop("disabled", false);
                // console.log("enable style");
                if (window.longTransitionTimeout) {
                    window.clearTimeout(longTransitionTimeout);
                    window.longTransitionTimeout = null;
                }
                window.longTransitionTimeout = setTimeout(() => {
                    $("#long-transition").prop("disabled", true);
                    // console.log("disable long transition");
                }, 500);
            } else {
                $("#long-transition").prop("disabled", false);
                // console.log("enable long transition");
                $("#minecraft-ui-style").prop("disabled", true);
                // console.log("disable style");
                if (window.longTransitionTimeout) {
                    window.clearTimeout(longTransitionTimeout);
                    window.longTransitionTimeout = null;
                }
                window.longTransitionTimeout = setTimeout(() => {
                    $("#long-transition").prop("disabled", true);
                    // console.log("disable long transition");
                }, 500);
            }
        }
    }).change();

    $("#recipe-table").on("click", ".detail", function () {
        const index = $(this).closest("tr").data("index");
        const item = order[index];
        window.currentShowingStep = index;
        $("#step-item-matrix").html(recipes[item].map ? renderMap(item) : '');
        if (!$("#setting-show-generated-map").is(":checked") && recipes[item].isGeneratedMap) {
            $("#step-item-matrix-group").hide();
        } else if (recipes[item].map?.length > 0) {
            $("#step-item-matrix-group").show();
        } else {
            $("#step-item-matrix-group").hide();
        }
        $("#step-target-item").html(renderItem(item, recipes[item].count ?? 1));
        $("#step-result-count").text((recipes[item].count ?? 1) * times[item]);
        $("#step-raw-product").html(recipes[item].ingredients.map(i => `${renderItem(i[0], i[1] ? i[1] : 1)}`).join(''));
        $("#step-times").text(times[item]);
        $("#step-product").html(recipes[item].ingredients.map(i => `${renderItem(i[0], i[1] ? i[1] * times[item] : times[item])}`).join(''));
        showStepRemain();
        $("#step-detail-modal").modal("show");
    });

    function getRandomKey(obj) {
        const keys = Object.keys(obj);
        if (keys.length === 0) return undefined; // 空对象没有键
        const randomIndex = Math.floor(Math.random() * keys.length);
        return keys[randomIndex];
    }

    $(".random-item").click(function () {
        const item = getRandomKey(recipes);
        if (item === undefined) {
            alert("没有可用的配方");
            return;
        }
        $("#input-item-select").val("single").change();
        $("#input-item").val(item);
        $('#search-result').hide();
        $("#calculate").click();
    });

    $("#long-transition").prop("disabled", true);

});