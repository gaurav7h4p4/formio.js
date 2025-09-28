import _ from 'lodash';
import { createTable, functionalUpdate, getCoreRowModel } from '@tanstack/table-core';
import DataGridComponent from './DataGrid';

const FALLBACK_HEADER_PREFIX = 'Column';

export default class TanstackDataGridComponent extends DataGridComponent {
  static schema(...extend) {
    const base = DataGridComponent.schema(...extend);
    const schema = _.cloneDeep(base);
    schema.type = 'tanstackDatagrid';
    if (schema.key === base.key) {
      schema.key = 'tanstackDataGrid';
    }
    return schema;
  }

  static get builderInfo() {
    const info = _.cloneDeep(DataGridComponent.builderInfo);
    info.title = 'TanStack Data Grid';
    info.icon = 'table-list';
    info.schema = TanstackDataGridComponent.schema();
    return info;
  }

  constructor(...args) {
    super(...args);
    this.type = 'tanstackDatagrid';
    if (this.component) {
      this.component.type = 'tanstackDatagrid';
    }
    this.tanstackTable = null;
    this.tanstackState = this.getDefaultTanstackState();
    this.tanstackLeafColumns = [];
    this.visibleColumnComponents = [];

    if (!Array.isArray(this.component.components)) {
      this.component.components = [];
    }
  }

  getDefaultTanstackState() {
    return {
      columnOrder: [],
      columnVisibility: {},
      columnSizing: {},
      columnSizingInfo: {},
      pagination: {
        pageIndex: 0,
        pageSize: 50,
      },
    };
  }

  get defaultSchema() {
    return TanstackDataGridComponent.schema();
  }

  get datagridKey() {
    return `datagrid-${this.key}`;
  }

  init() {
    if (!Array.isArray(this.component.components)) {
      this.component.components = [];
    }
    super.init();
    if (!Array.isArray(this.component.components)) {
      this.component.components = [];
    }
    this.syncTanstackTable();
  }

  getRowValues() {
    const values = super.getRowValues();
    return Array.isArray(values) ? values : [];
  }

  get dataValue() {
    return super.dataValue;
  }

  set dataValue(value) {
    super.dataValue = value;
    this.syncTanstackTable();
  }

  syncTanstackTable() {
    if (!Array.isArray(this.columns)) {
      this.columns = Array.isArray(this.component.components)
        ? [...this.component.components]
        : [];
    }

    if (!this.visibleColumns || typeof this.visibleColumns !== 'object') {
      this.visibleColumns = {};
    }

    const resolvedComponents = Array.isArray(this.columns) ? this.getColumns() : [];
    this.visibleColumnComponents = resolvedComponents;

    const columnOrder = this.ensureColumnOrder(resolvedComponents);

    const columns = resolvedComponents.map((component, columnIndex) => {
      const columnId = this.getColumnId(component, columnIndex);
      const initialSize = _.get(component, 'overlay.width');
      const columnDef = {
        id: columnId,
        header: component.label || component.title || component.key || `${FALLBACK_HEADER_PREFIX} ${columnIndex + 1}`,
        accessorFn: (row) => row?.[component.key],
        meta: {
          componentKey: component.key,
          columnIndex,
        },
        enableResizing: true,
      };

      if (_.isNumber(initialSize)) {
        columnDef.size = initialSize;
      }

      return columnDef;
    });

    const dataArray = Array.isArray(this.dataValue) ? this.dataValue : [];
    const resolvedData = dataArray.map((row, index) => ({
      __rowIndex: index,
      ...row,
    }));

    const tableState = {
      ...this.getDefaultTanstackState(),
      ...this.tanstackState,
      columnOrder,
    };

    const options = {
      data: resolvedData,
      columns,
      state: tableState,
      onStateChange: this.handleTanstackStateChange.bind(this),
      renderFallbackValue: '',
      getCoreRowModel: getCoreRowModel(),
      columnResizeMode: 'onChange',
    };

    if (this.tanstackTable) {
      this.tanstackTable.setOptions((prev) => ({
        ...prev,
        ...options,
      }));
    }
    else {
      this.tanstackTable = createTable(options);
    }

    this.tanstackLeafColumns = this.tanstackTable.getAllLeafColumns();
  }

  handleTanstackStateChange(updater) {
    const previousState = this.tanstackState;
    const nextState = functionalUpdate(updater, previousState);
    const mergedState = {
      ...this.getDefaultTanstackState(),
      ...nextState,
    };

    this.tanstackState = mergedState;

    if (!_.isEqual(previousState.columnSizing, mergedState.columnSizing)) {
      this.updateRenderedColumnSizes();
    }

    const requiresRedraw = !_.isEqual(previousState.columnOrder, mergedState.columnOrder)
      || !_.isEqual(previousState.columnVisibility, mergedState.columnVisibility)
      || !_.isEqual(previousState.pagination, mergedState.pagination);

    if (requiresRedraw) {
      this.redraw();
    }
  }

  ensureColumnOrder(components) {
    const componentIds = components.map((component, columnIndex) => this.getColumnId(component, columnIndex));
    const currentOrder = Array.isArray(this.tanstackState.columnOrder) ? this.tanstackState.columnOrder : [];
    const preservedOrder = componentIds.filter((id) => currentOrder.includes(id));
    const newIds = componentIds.filter((id) => !currentOrder.includes(id));
    const nextOrder = preservedOrder.concat(newIds);

    if (!currentOrder.length || !_.isEqual(currentOrder, nextOrder)) {
      this.tanstackState = {
        ...this.tanstackState,
        columnOrder: nextOrder,
      };
    }

    return nextOrder;
  }

  buildHeaderGroups() {
    if (!this.tanstackTable) {
      return [];
    }

    const table = this.tanstackTable;
    const headerGroups = table.getHeaderGroups();

    return headerGroups.map((group) => ({
      id: group.id,
      headers: group.headers.map((header) => {
        const column = header.column;
        const componentKey = column?.columnDef?.meta?.componentKey;
        const component = this.visibleColumnComponents.find((comp) => comp.key === componentKey);
        const headerDef = header.column?.columnDef?.header;
        const headerLabel = typeof headerDef === 'function'
          ? headerDef({ column, table })
          : headerDef;

        return {
          id: header.id,
          columnId: column?.id,
          colSpan: header.colSpan,
          rowSpan: header.rowSpan,
          isPlaceholder: header.isPlaceholder,
          size: header.getSize ? header.getSize() : column?.getSize?.(),
          text: headerLabel || component?.label || component?.title || componentKey || '',
          canResize: column?.getCanResize?.() ?? false,
        };
      }),
    }));
  }

  buildRowModels() {
    const rowModels = [];
    if (!this.rows || !this.rows.length) {
      return rowModels;
    }

    const tanstackRows = this.tanstackTable ? this.tanstackTable.getRowModel().rows : [];

    if (tanstackRows.length) {
      tanstackRows.forEach((row) => {
        const rowIndex = (row.index ?? row.original?.__rowIndex ?? parseInt(row.id, 10)) || 0;
        const rowComponents = this.rows[rowIndex] || {};
        const cells = {};

        this.visibleColumnComponents.forEach((component) => {
          const cellComponent = rowComponents[component.key];
          cells[component.key] = cellComponent ? cellComponent.render() : '';
        });

        rowModels.push({
          id: row.id,
          index: rowIndex,
          cells,
        });
      });
    }
    else {
      this.rows.forEach((rowComponents, rowIndex) => {
        const cells = {};
        this.visibleColumnComponents.forEach((component) => {
          const cellComponent = rowComponents[component.key];
          cells[component.key] = cellComponent ? cellComponent.render() : '';
        });
        rowModels.push({
          id: `${rowIndex}`,
          index: rowIndex,
          cells,
        });
      });
    }

    return rowModels;
  }

  render() {
    this.syncTanstackTable();
    const headerGroups = this.buildHeaderGroups();
    const rows = this.buildRowModels();
    const hasRemoveButtons = this.hasRemoveButtons();
    let columnExtra = 0;
    if (this.component.reorder) {
      columnExtra++;
    }
    if (hasRemoveButtons) {
      columnExtra++;
    }
    if (this.canAddColumn) {
      columnExtra++;
    }
    const colWidth = this.visibleColumnComponents.length
      ? Math.floor(12 / (this.visibleColumnComponents.length + columnExtra))
      : 12;

    const columnMetadata = this.tanstackLeafColumns.map((column, columnIndex) => {
      const component = this.visibleColumnComponents[columnIndex];
      const headerGroup = headerGroups[headerGroups.length - 1];
      const header = headerGroup?.headers?.find((h) => h.columnId === column.id);
      const headerText = header?.text || component?.label || component?.title || component?.key || `${FALLBACK_HEADER_PREFIX} ${columnIndex + 1}`;
      const size = header?.size || column?.getSize?.();

      return {
        id: column.id,
        key: component?.key,
        component,
        text: headerText,
        size,
        canResize: column?.getCanResize?.() ?? false,
        headerId: header?.id,
      };
    });

    return super.render(this.renderTemplate('tanstackDatagrid', {
      component: this.component,
      rows,
      headerGroups,
      columnMetadata,
      columns: this.visibleColumnComponents,
      groups: this.hasRowGroups() ? this.getGroups() : [],
      hasToggle: _.get(this, 'component.groupToggle', false),
      hasHeader: this.hasHeader(),
      hasExtraColumn: this.hasExtraColumn(),
      hasAddButton: this.hasAddButton(),
      hasRemoveButtons,
      hasTopSubmit: this.hasTopSubmit(),
      hasBottomSubmit: this.hasBottomSubmit(),
      hasGroups: this.hasRowGroups(),
      numColumns: this.visibleColumnComponents.length + (this.hasExtraColumn() ? 1 : 0),
      datagridKey: this.datagridKey,
      allowReorder: this.allowReorder,
      builder: this.builderMode,
      canAddColumn: this.canAddColumn,
      tabIndex: this.tabIndex,
      placeholder: this.renderTemplate('builderPlaceholder', {
        position: this.componentComponents.length,
      }),
      colWidth: colWidth.toString(),
    }));
  }

  updateRenderedColumnSizes() {
    if (!this.element || !this.tanstackTable) {
      return;
    }

    const headerSizes = {};
    this.tanstackTable.getFlatHeaders().forEach((header) => {
      if (header?.column?.id) {
        headerSizes[header.column.id] = header.getSize ? header.getSize() : header.column.getSize?.();
      }
    });

    Object.entries(headerSizes).forEach(([columnId, size]) => {
      const targetSize = _.isNumber(size) ? `${size}px` : '';
      const elements = this.element.querySelectorAll(`[data-tanstack-column-id="${columnId}"]`);
      elements.forEach((el) => {
        el.style.width = targetSize;
      });
    });
  }

  attach(element) {
    const attached = super.attach(element);

    if (!this.tanstackTable) {
      return attached;
    }

    const resizeHandles = element.querySelectorAll('[data-tanstack-resize-handle]');
    const flatHeaders = this.tanstackTable.getFlatHeaders();

    resizeHandles.forEach((handle) => {
      const headerId = handle.getAttribute('data-tanstack-header-id');
      const header = flatHeaders.find((candidate) => candidate.id === headerId);

      if (header && header.column?.getCanResize?.()) {
        const resizeHandler = header.getResizeHandler ? header.getResizeHandler() : null;

        if (resizeHandler) {
          this.addEventListener(handle, 'mousedown', resizeHandler);
          this.addEventListener(handle, 'touchstart', resizeHandler);
        }
      }
    });

    this.updateRenderedColumnSizes();

    return attached;
  }

  getColumns() {
    const columns = super.getColumns();
    const order = Array.isArray(this.tanstackState.columnOrder) ? this.tanstackState.columnOrder : [];

    if (!order.length) {
      return columns;
    }

    const columnMap = columns.reduce((acc, column, index) => {
      const columnId = this.getColumnId(column, index);
      if (columnId) {
        acc[columnId] = column;
      }
      return acc;
    }, {});

    const orderedColumns = [];
    order.forEach((columnId) => {
      if (columnMap[columnId]) {
        orderedColumns.push(columnMap[columnId]);
        delete columnMap[columnId];
      }
    });

    return orderedColumns.concat(columns.filter((column) => {
      const columnId = this.getColumnId(column, columns.indexOf(column));
      return order.indexOf(columnId) === -1;
    }));
  }

  getColumnId(component, columnIndex = 0) {
    if (!component || typeof component !== 'object') {
      return `column-${columnIndex}`;
    }

    if (component.key) {
      return component.key;
    }

    if (component.path) {
      return component.path;
    }

    if (component.id) {
      return component.id;
    }

    if (component.type) {
      return `${component.type}-${columnIndex}`;
    }

    return `column-${columnIndex}`;
  }
}
