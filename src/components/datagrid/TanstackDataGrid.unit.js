import _ from 'lodash';
import TanstackDataGridComponent from './TanstackDataGrid';

const convertDatagridType = (schema) => {
  const clone = _.cloneDeep(schema);

  function visitComponent(component) {
    if (!component || typeof component !== 'object') {
      return;
    }

    if (component.type === 'datagrid' || component.type === 'tanstackDatagrid') {
      component.type = 'tanstackDatagrid';
    }

    if (Array.isArray(component.components)) {
      visitComponentArray(component.components);
    }

    if (Array.isArray(component.rows)) {
      component.rows.forEach((row) => {
        if (Array.isArray(row)) {
          visitComponentArray(row);
        }
        else if (row && Array.isArray(row.components)) {
          visitComponentArray(row.components);
        }
        else {
          visitComponent(row);
        }
      });
    }

    if (Array.isArray(component.columns)) {
      component.columns.forEach((column) => {
        if (column && Array.isArray(column.components)) {
          visitComponentArray(column.components);
        }
      });
    }
  }

  function visitComponentArray(components = []) {
    components.forEach(visitComponent);
  }

  if (Array.isArray(clone.components)) {
    visitComponentArray(clone.components);
  }

  visitComponent(clone);
  return clone;
};

global.__formioActiveComponent__ = TanstackDataGridComponent;
global.__formioFixtureTransform__ = convertDatagridType;

require('./DataGrid.unit');

delete global.__formioActiveComponent__;
delete global.__formioFixtureTransform__;
