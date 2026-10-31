import {hasWeight} from './calc.js';

export function unitWeight(item,cn) {
  const override=item.overrides?.[cn];
  return override!==undefined&&override!==''?override:item.weight;
}

export function ownerWeight(item,owner) {
  const unit=unitWeight(item,owner.cn);
  return hasWeight(unit)?Number(unit)*owner.qty:null;
}

export function fillSingleProduct(order,weight) {
  if(order.items.length!==1)throw Error('只有一个商品条目的订单才能统一填充');
  if(!hasWeight(weight))throw Error('请先填写大于 0 的单件克重');
  const item=order.items[0];
  item.weight=Number(weight);
  item.overrides={};
  order.unitDraft=weight;
  order.mode='item';
  order.complete=false;
}
