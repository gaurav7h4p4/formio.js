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
    this.tanstackState = { columnOrder: [] };
    this.tanstackLeafColumns = [];
    this.visibleColumnComponents = [];

    if (!Array.isArray(this.component.components)) {
      this.component.components = [];
    }
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

    this.visibleColumnComponents = Array.isArray(this.columns) ? this.getColumns() : [];
    const columns = this.visibleColumnComponents.map((component, columnIndex) => ({
      id: component.key || `column-${columnIndex}`,
      header: component.label || component.title || component.key || `${FALLBACK_HEADER_PREFIX} ${columnIndex + 1}`,
      accessorFn: (row) => row?.[component.key],
      meta: {
        componentKey: component.key,
        columnIndex,
      },
    }));

    const dataArray = Array.isArray(this.dataValue) ? this.dataValue : [];
    const resolvedData = dataArray.map((row, index) => ({
      __rowIndex: index,
      ...row,
    }));

    const tableState = { columnOrder: [], ...this.tanstackState };

    const options = {
      data: resolvedData,
      columns,
      state: tableState,
      onStateChange: this.handleTanstackStateChange.bind(this),
      renderFallbackValue: '',
      getCoreRowModel: getCoreRowModel(),
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
    const nextState = functionalUpdate(updater, this.tanstackState);
    this.tanstackState = { columnOrder: [], ...nextState };
    if (this.tanstackTable) {
      this.tanstackTable.setOptions((prev) => ({
        ...prev,
        state: { columnOrder: [], ...this.tanstackState },
      }));
    }
  }

  buildHeaderCells() {
    if (!this.tanstackLeafColumns.length && this.visibleColumnComponents.length) {
      this.tanstackLeafColumns = this.visibleColumnComponents.map((component, columnIndex) => ({
        id: component.key || `column-${columnIndex}`,
        columnDef: { header: component.label || component.title || component.key || `${FALLBACK_HEADER_PREFIX} ${columnIndex + 1}` },
      }));
    }

    return this.visibleColumnComponents.map((component, columnIndex) => {
      const column = this.tanstackLeafColumns[columnIndex];
      const headerDef = column?.columnDef?.header;
      const header = typeof headerDef === 'function'
        ? headerDef({ column, table: this.tanstackTable })
        : headerDef;

      return {
        id: column?.id || component.key || `column-${columnIndex}`,
        text: header || component.label || component.title || component.key || `${FALLBACK_HEADER_PREFIX} ${columnIndex + 1}`,
        component,
      };
    });
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
    const headerCells = this.buildHeaderCells();
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

    return super.render(this.renderTemplate('tanstackDatagrid', {
      component: this.component,
      rows,
      headerCells,
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
}
