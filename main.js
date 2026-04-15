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

const STORAGE_KEY = 'crafting-calculator-state';
const SETTINGS_KEY = 'crafting-calculator-settings';
window.autoCalculateTimer = null;

function saveSettings() {
    const settings = {
        hoverHighlight: $("#setting-hover-highlight").is(":checked"),
        autoCalculateDelay: $("#setting-auto-calculate").val()
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
        const item = $tr.find('input[name=key]').val().replace(/\s+/g, '');
        const count = $tr.find('input[name=count]').val().replace(/\s+/g, '');
        if (item || count) {
            state.multiItemList.push({key: item, count: count || '1'});
        }
    });

    $("#item-already-have").find("tr").each(function () {
        const $tr = $(this);
        const item = $tr.find('input[name=key]').val().replace(/\s+/g, '');
        const count = $tr.find('input[name=count]').val().replace(/\s+/g, '');
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
            const $tr = $(`
                <tr>
                    <td>${renderItem(key, -1)}</td>
                    <td><input type="text" class="form-control in-computation-process" name="key" list="item-list" value="${key}"></td>
                    <td><input type="text" class="form-control in-computation-process" name="count" oninput="checkNumber(this)" value="${count}"></td>
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
            const $tr = $(`
                <tr>
                    <td>${renderItem(key, -1)}</td>
                    <td><input type="text" class="form-control in-computation-process" name="key" list="item-list" value="${key}"></td>
                    <td><input type="text" class="form-control in-computation-process" name="count" oninput="checkNumber(this)" value="${count === '-1' ? '' : count}"></td>
                    <td><button class="btn btn-danger" data-action="delete">删除</button></td>
                </tr>
            `);
            $table.append($tr);
            if (key) {
                if (recipes[key]) {
                    $tr.find('input[name=key]').removeClass('has-error').removeClass('has-warning');
                } else if (icons[key]) {
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
        const $tr = $(`<tr class="search-result-item" data-key="${key}"><td>${renderItem(key, -1)}</td><td><div class="search-result-key">${key}</div></td></tr>`);
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
        const key = $("#input-item").val().replace(/\s+/g, '');
        if (key) {
            itemList = [[key, 1]];
        }
    } else {
        $("#item-target-list").find("tr").each(function () {
            const $tr = $(this);
            const item = $tr.find('input[name=key]').val().replace(/\s+/g, '');
            const count = $tr.find('input[name=count]').val().replace(/\s+/g, '');
            if (item && count && parseInt(count) > 0) {
                itemList.push([item, parseInt(count)]);
            }
        });
    }
    window.currentShowing = itemList;
}

function showRecipe() {
    if (window.currentShowing.length === 0) {
        return;
    }
    readAlreadyHave();
    for (const item of window.currentShowing) {
        const key = item[0];
        if (!recipes[key]) {
            console.error(`找不到配方 ${key}`);
            return;
        }
        if (window.alreadyHave[key]) {
            alert(`已经拥有 ${key}`);
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
            alert('计算超时，请检查输入');
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
                        console.error(`找不到 ${key} 在order中的位置`);
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
    for (const item of order) {
        // console.log(`${recipes[item].type}: ${recipes[item].ingredients.map(i => `${i[0]} x ${i[1] ? i[1] * times[item] : times[item]}`).join(' + ')} => ${item} x ${count[item]}`);
        orderHtml += `
            <tr>
                <td>${recipes[item].map ? renderMap(item) : ''}</td>
                <td class="item-group">${recipes[item].ingredients.map(i => `${renderItem(i[0], i[1] ? i[1] * times[item] : times[item])}`).join('')}</td>
                <td>${renderItem(recipes[item].type, 0)}</td>
                <td>${renderItem(item, count[item])}</td>
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
    const keyword = $("#input-item").val().replace(/\s+/g, '');

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
        readItemList();
        hideDirtyWarning();
        if (window.currentShowing.length > 0) {
            showRecipe();
        }
    }, delay);
}

function addAlreadyItem(key = "", count = -1, update = true) {
    const $table = $("#item-already-have");
    $table.append(`
        <tr>
            <td>${renderItem(key, -1)}</td>
            <td><input type="text" class="form-control in-computation-process" name="key" list="item-list" value="${key}"></td>
            <td><input type="text" class="form-control in-computation-process" name="count" oninput="checkNumber(this)" value="${count === -1 ? '' : count}"></td>
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
        const key = $tr.find('input[name=key]').val().replace(/\s+/g, '');
        const countInput = $tr.find('input[name=count]').val().replace(/\s+/g, '');
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
        const key = $tr.find('input[name=key]').val().replace(/\s+/g, '');
        let count = $tr.find('input[name=count]').val().replace(/\s+/g, '');
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
    if (count === -1) {
        if (getIconUrl(key)) {
            return `<span class="item just-icon" data-key="${key}"><img class="item-icon" data-key="${key}" src="${getIconUrl(key)}" alt="" title="${key}"></span>`;
        } else {
            let reducedKey = key.replace(/[^A-Za-z0-9一-龟]+/g, '');
            if (reducedKey.length > 2) {
                reducedKey = reducedKey.charAt(0) + reducedKey.slice(-1);
            }
            return `<span class="item just-icon" data-key="${key}"><div class="item-icon-unknown ${key.length === 1 ? 'item-icon-unknown-single' : 'item-icon-unknown-double'}" title="${key}">${reducedKey}</div></span>`;
        }
    } else if (count === 0) {
        return `<span class="item" data-key="${key}">${getIconUrl(key) ? `<img class="item-icon" data-key="${key}" src="${getIconUrl(key)}" alt="">` : ''}${key}</span>`;
    } else {
        const quotient = Math.floor(count / 64);
        const remainder = count % 64;
        let humanCount;
        if (quotient > 0) {
            if (remainder > 0) {
                humanCount = `<span class="group-count">${quotient}</span><span class="group-sep">×64</span><span class="plus">+</span>${remainder}`;
            } else {
                humanCount = `<span class="group-count">${quotient}</span><span class="group-sep">×64</span>`;
            }
        } else {
            humanCount = `${remainder}`;
        }
        return `<span class="item" data-key="${key}">${getIconUrl(key) ? `<img class="item-icon" data-key="${key}" src="${getIconUrl(key)}" alt="">` : ''}${key} <span class="count">${humanCount}</span></span>`;
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
    return icons[key] ? `icons/${icons[key]}.png` : null;
}

function sortBasicCount() {
    if ($.isEmptyObject(window.basicCount)) return;
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
        showRecipe();
    }).on('focus', 'input', function (event) {
        event.target.select();
    }).on('input', 'input[name=key]', function (event) {
        const key = $(event.target).val().replace(/\s+/g, '');
        const isItemTargetList = $(event.target).closest("tbody").is("#item-target-list");
        if (key.length > 0) {
            if (recipes[key]) {
                $(event.target).parent().prev().html(renderItem(key, -1));
                $(event.target).removeClass('has-error');
                $(event.target).removeClass('has-warning');
            } else {
                if (isItemTargetList) {
                    if (icons[key]) {
                        $(event.target).parent().prev().html(renderItem(key, -1));
                    } else {
                        $(event.target).parent().prev().html(renderItem('', -1));
                    }
                    $(event.target).addClass('has-error');
                    $(event.target).removeClass('has-warning');
                } else {
                    if (icons[key]) {
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
            const count = $(event.target).val().replace(/\s+/g, '');
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
        $(this).next().collapse('toggle');
    });

    // $("#introduction-toggle").next().collapse('toggle');

    $("#inference-toggle").click(function () {
        toShowInference();
    });

    $("#calculate").click(function () {
        readItemList();
        hideDirtyWarning();
        if (window.currentShowing.length === 0) {
            alert('请先输入物品');
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
            alert(`找不到配方 ${cantFind.join(', ')}`);
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
            $(`.item[data-key="${key}"]`).addClass('highlight');
        })
        .on('mouseleave', '.item', function (event) {
            const $item = $(event.target).closest('.item');
            const key = $item.data('key');
            if (!key) return;
            $(`.item[data-key="${key}"]`).removeClass('highlight');
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
                const item = $tr.find('input[name=key]').val().replace(/\s+/g, '');
                const count = $tr.find('input[name=count]').val().replace(/\s+/g, '') || '1';
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
                const item = $tr.find('input[name=key]').val().replace(/\s+/g, '');
                let count = $tr.find('input[name=count]').val().replace(/\s+/g, '');
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
        const $tr = $(`
            <tr>
                <td>${renderItem(key, -1)}</td>
                <td><input type="text" class="form-control in-computation-process" name="key" list="item-list" value="${key}"></td>
                <td><input type="text" class="form-control in-computation-process" name="count" oninput="checkNumber(this)" value="${count}"></td>
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

    $("#setting-hover-highlight, #setting-auto-calculate").change(function () {
        saveSettings();
    });

});