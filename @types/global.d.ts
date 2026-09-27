import type * as React from "react";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace DiceUI {
    type Theme = import("../theme/styles/index").ThemeVarType;
  }

  // React 19 移除了全局 JSX 命名空间，旧代码仍在用 JSX.*
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type Element = React.JSX.Element;
    type ElementClass = React.JSX.ElementClass;
    type ElementType = React.JSX.ElementType;
    type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>;
    interface IntrinsicAttributes extends React.JSX.IntrinsicAttributes {}
    interface IntrinsicClassAttributes<T>
      extends React.JSX.IntrinsicClassAttributes<T> {}
    interface IntrinsicElements extends React.JSX.IntrinsicElements {}
    interface ElementChildrenAttribute {
      children: React.ReactNode;
    }
  }
}

export {};
// declare module '*.png';
// declare module 'numeral';
// declare module 'echarts/lib/coord/geo/geoSourceManager';
// declare module '*.jpg';
// declare module '*.jpeg';
// declare module '*.gif';
// declare module 'react-native-mopsdk';

// declare type TFormMode = 'edit' | 'view';
// declare type TSubmitType = 'SAVE' | 'SUBMIT';

// declare global {
//   // eslint-disable-next-line @typescript-eslint/no-namespace
//   namespace ReactNavigation {
//     // eslint-disable-next-line @typescript-eslint/no-empty-interface
//     interface RootParamList {
//       push: any;
//     }
//   }
// }
